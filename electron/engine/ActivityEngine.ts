import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEvent, Session, WorkflowSession } from '../shared/types';
import { WindowCollector } from '../collectors/WindowCollector';
import { EventBus } from './EventBus';
import { BACKEND_URL } from '../config';
import { ActivityStore } from '../store/ActivityStore';
import { ActivityGateway } from './ActivityGateway';
import { ResumeEngine } from './ResumeEngine';
import { authenticatedBackendFetch } from '../backendClient';

const INACTIVITY_SPLIT_MS = 10 * 60 * 1000; // 10 minutes of true inactivity before session split
const MIN_PERSIST_DURATION_MS = 30 * 1000;  // 30s min duration to avoid ephemeral micro-clutter
const EMBED_THROTTLE_MS = 15 * 1000;        // Throttle vector embeddings to once every 15s

export class ActivityEngine {
  private bus: EventBus;
  private store: ActivityStore;
  private gateway: ActivityGateway;
  private resumer: ResumeEngine;
  private collectors: any[] = [];
  private currentSession: Session;
  
  private fallbackApps = new Set<string>();
  private appEventCounts = new Map<string, number>();
  private fallbackTitles = new Set<string>();
  private fallbackUrls = new Set<string>();
  private fallbackFiles = new Set<string>();
  
  private lastActivityTime: number = Date.now();
  private lastEmbedTime: number = 0;
  private idleSplitTimer: NodeJS.Timeout | null = null;
  private isSessionActive: boolean = true;

  constructor(store: ActivityStore) {
    this.bus = EventBus.getInstance();
    this.store = store;
    this.resumer = new ResumeEngine();
    
    this.currentSession = {
      id: uuidv4(),
      startTime: Date.now(),
      hostname: os.hostname(),
      platform: process.platform,
      eventCount: 0
    };

    this.gateway = new ActivityGateway(this.currentSession.id);
  }

  public getSessionId(): string {
    return this.currentSession.id;
  }

  async start() {
    console.log(`[ActivityEngine] Starting session: ${this.currentSession.id}`);
    
    // Start sub-systems
    this.gateway.start();

    // Persist initial session record
    this.store.saveSession(this.currentSession);

    // Subscribe to all activity events
    this.bus.onActivity(async (event: ActivityEvent) => {
      try {
        this.store.saveEvent(event);
      } catch (err) {
        console.error('[ActivityEngine] Failed to save event to database:', err);
      }

      this.processActivityEvent(event);
    });

    // Initialize collectors
    const windowCollector = new WindowCollector(this.currentSession.id);
    this.collectors.push(windowCollector);

    for (const collector of this.collectors) {
      await collector.start();
    }
  }

  private isUtilityApp(appName: string): boolean {
    if (!appName) return false;
    const lower = appName.toLowerCase().replace('.exe', '');
    const utilities = ['explorer', 'snippingtool', 'notepad', 'calculator', 'taskmgr', 'settings', 'shellexperiencehost', 'searchhost'];
    return utilities.includes(lower);
  }

  private getDominantApps(): string[] {
    // Sort apps by frequency of interaction, placing non-utility primary apps first
    const apps = Array.from(this.fallbackApps);
    return apps.sort((a, b) => {
      const aIsUtil = this.isUtilityApp(a) ? 1 : 0;
      const bIsUtil = this.isUtilityApp(b) ? 1 : 0;
      if (aIsUtil !== bIsUtil) return aIsUtil - bIsUtil;
      const countA = this.appEventCounts.get(a) || 0;
      const countB = this.appEventCounts.get(b) || 0;
      return countB - countA;
    });
  }

  private generateDynamicName(apps: string[], urls: string[], files: string[]): string {
    const appsText = apps.join(' ').toLowerCase();
    const urlsText = urls.join(' ').toLowerCase();

    // 1. Software Engineering & Development
    const isDev = appsText.includes('code') || 
                  appsText.includes('cursor') || 
                  appsText.includes('terminal') || 
                  appsText.includes('antigravity') || 
                  appsText.includes('cmd') || 
                  appsText.includes('powershell');

    if (isDev) {
      if (urlsText.includes('github') || urlsText.includes('stackoverflow') || urlsText.includes('npm') || urlsText.includes('pypi')) {
        return 'Codebase Integration & Troubleshooting';
      }
      if (urlsText.includes('react') || urlsText.includes('node') || urlsText.includes('mdn') || urlsText.includes('developer') || urlsText.includes('docs')) {
        return 'Development & Documentation Review';
      }
      if (files.length > 0) {
        const topFile = files[0];
        return `Software Engineering: ${topFile}`;
      }
      return 'Software Engineering & Architecture';
    }

    // 2. Creative Design & Visual Media
    if (appsText.includes('figma') || appsText.includes('photoshop') || appsText.includes('illustrator') || appsText.includes('blender') || appsText.includes('design')) {
      return 'Creative Design & Prototyping';
    }

    // 3. Media & Research
    if (urlsText.includes('youtube') || urlsText.includes('twitch') || urlsText.includes('vimeo') || urlsText.includes('spotify')) {
      return 'Media Consumption & Video Research';
    }

    // 4. Documentation & Strategy
    if (urlsText.includes('docs.google') || appsText.includes('word') || appsText.includes('notion') || appsText.includes('obsidian') || appsText.includes('onenote')) {
      return 'Documentation & Strategy Planning';
    }

    // 5. Slides & Presentations
    if (urlsText.includes('slideshare') || urlsText.includes('presentation') || urlsText.includes('slides') || appsText.includes('powerpnt')) {
      return 'Presentation & Slide Deck Assembly';
    }

    // 6. Communication
    if (urlsText.includes('mail') || urlsText.includes('slack') || urlsText.includes('discord') || appsText.includes('teams') || appsText.includes('telegram')) {
      return 'Communication & Team Sync';
    }

    // 7. Web Exploration
    if (appsText.includes('chrome') || appsText.includes('edge') || appsText.includes('firefox') || appsText.includes('browser')) {
      if (urls.length > 0) {
        try {
          const domain = new URL(urls[0]).hostname.replace('www.', '');
          return `Web Exploration: ${domain}`;
        } catch (e) {}
      }
      return 'Ambient Web Exploration';
    }

    // 8. Focused Non-Utility App
    const nonUtil = apps.find(a => !this.isUtilityApp(a));
    if (nonUtil) {
      return `Focused Workflow: ${nonUtil}`;
    }

    if (apps.length > 0) {
      return `Focused Workflow: ${apps[0]}`;
    }

    return 'Ambient Cognitive Context';
  }

  private processActivityEvent(event: ActivityEvent) {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;

    // Check if the user was inactive for > 10 minutes (True Inactivity Split)
    if (timeSinceLastActivity > INACTIVITY_SPLIT_MS && !this.isSessionActive) {
      this.startNewSession(now);
    }

    this.isSessionActive = true;
    this.lastActivityTime = now;
    this.currentSession.eventCount++;

    // Extract context
    const appName = event.payload?.appName || (event.payload as any)?.browser;
    const windowTitle = event.payload?.windowTitle || (event.payload as any)?.title;
    const url = (event.payload as any)?.url;

    if (appName) {
      this.fallbackApps.add(appName);
      this.appEventCounts.set(appName, (this.appEventCounts.get(appName) || 0) + 1);
    }

    if (windowTitle) {
      this.fallbackTitles.add(windowTitle);
      const fileMatch = windowTitle.match(/(?:^|[\\/\s])([a-zA-Z0-9_-]+\.(?:tsx|ts|js|jsx|py|css|html|md|json|txt|cpp|c|h|go|rs))(?:\s|-|$)/i);
      if (fileMatch && fileMatch[1]) {
        this.fallbackFiles.add(fileMatch[1]);
      }
    }

    if (url) {
      this.fallbackUrls.add(url);
    }

    const dominantApps = this.getDominantApps();
    const currentDynamicName = this.generateDynamicName(dominantApps, Array.from(this.fallbackUrls), Array.from(this.fallbackFiles));
    const duration = Math.max(1000, now - this.currentSession.startTime);

    // Build Live Workflow Session
    const liveSession: WorkflowSession = {
      id: this.currentSession.id,
      name: currentDynamicName,
      startTime: this.currentSession.startTime,
      duration,
      dominantApps,
      windowTitles: Array.from(this.fallbackTitles),
      urls: Array.from(this.fallbackUrls),
      files: Array.from(this.fallbackFiles),
      eventCount: this.currentSession.eventCount,
      status: 'active',
      contextSummary: `Active context capturing ${this.fallbackApps.size} apps, ${this.fallbackFiles.size} files, and ${this.fallbackUrls.size} URLs...`,
      probableObjective: currentDynamicName,
      confidenceScore: 0.90,
      relatedSessions: []
    };

    // Emit live UI update
    this.bus.emit('ui-workflow-update', liveSession);

    // Throttled ChromaDB Embeddings (every 15s max during active typing/window switching)
    if (now - this.lastEmbedTime > EMBED_THROTTLE_MS) {
      this.lastEmbedTime = now;
      authenticatedBackendFetch(`${BACKEND_URL}/memory/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(liveSession)
      }).catch(() => {});
    }

    // Schedule Inactivity Idle Timer (10 minutes)
    if (this.idleSplitTimer) clearTimeout(this.idleSplitTimer);
    this.idleSplitTimer = setTimeout(() => {
      this.handleInactivityTimeout();
    }, INACTIVITY_SPLIT_MS);
  }

  private async handleInactivityTimeout() {
    console.log(`[ActivityEngine] Inactivity threshold (${INACTIVITY_SPLIT_MS / 60000}m) reached. Sealing active session.`);
    this.isSessionActive = false;

    const duration = this.lastActivityTime - this.currentSession.startTime;

    // Only finalize and persist if duration is meaningful (avoid 0s ghost sessions)
    if (duration >= MIN_PERSIST_DURATION_MS || this.currentSession.eventCount >= 2) {
      const dominantApps = this.getDominantApps();
      let sessionName = this.generateDynamicName(dominantApps, Array.from(this.fallbackUrls), Array.from(this.fallbackFiles));

      // Attempt AI Name refinement if available
      try {
        const res = await authenticatedBackendFetch(`${BACKEND_URL}/api/generate-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apps: dominantApps,
            urls: Array.from(this.fallbackUrls)
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.name) sessionName = data.name;
        }
      } catch (e) {}

      const sealedSession: WorkflowSession = {
        id: this.currentSession.id,
        name: sessionName,
        startTime: this.currentSession.startTime,
        endTime: this.lastActivityTime,
        duration,
        dominantApps,
        windowTitles: Array.from(this.fallbackTitles),
        urls: Array.from(this.fallbackUrls),
        files: Array.from(this.fallbackFiles),
        eventCount: this.currentSession.eventCount,
        status: 'closed',
        contextSummary: `Captured ${dominantApps.length} apps, ${this.fallbackFiles.size} files, and ${this.fallbackUrls.size} URLs`,
        probableObjective: sessionName,
        confidenceScore: 0.95,
        relatedSessions: []
      };

      this.bus.emit('ui-workflow-update', sealedSession);
    }
  }

  private startNewSession(startTime: number) {
    this.currentSession.id = uuidv4();
    this.currentSession.startTime = startTime;
    this.currentSession.eventCount = 0;
    
    this.fallbackApps.clear();
    this.appEventCounts.clear();
    this.fallbackTitles.clear();
    this.fallbackUrls.clear();
    this.fallbackFiles.clear();

    console.log(`[ActivityEngine] Started new session boundary: ${this.currentSession.id}`);

    // Update collectors so future events carry the new session ID
    for (const collector of this.collectors) {
      if ((collector as any).sessionId) {
        (collector as any).sessionId = this.currentSession.id;
      }
    }
  }

  async searchMemory(query: string) {
    try {
      const response = await authenticatedBackendFetch(`${BACKEND_URL}/memory/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 5 })
      });
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (err) {
      console.error('[ActivityEngine] Failed to search memory via backend:', err);
      return [];
    }
  }

  async resumeWorkflow(session: WorkflowSession) {
    await this.resumer.resumeWorkflow(session);
  }

  async stop() {
    this.currentSession.endTime = Date.now();
    this.store.saveSession(this.currentSession);
    
    this.gateway.stop();

    if (this.idleSplitTimer) clearTimeout(this.idleSplitTimer);

    for (const collector of this.collectors) {
      await collector.stop();
    }
    
    console.log(`[ActivityEngine] Stopped session: ${this.currentSession.id}`);
  }

  getCurrentSession() {
    return this.currentSession;
  }
}
