import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEvent, Session, WorkflowSession } from '../../shared/types';
import { WindowCollector } from '../collectors/WindowCollector';
import { EventBus } from './EventBus';
import { ActivityStore } from '../store/ActivityStore';
import { ActivityGateway } from './ActivityGateway';
import { ResumeEngine } from './ResumeEngine';

const BACKEND_URL = 'http://127.0.0.1:8000';

export class ActivityEngine {
  private bus: EventBus;
  private store: ActivityStore;
  private gateway: ActivityGateway;
  private resumer: ResumeEngine;
  private collectors: any[] = [];
  private currentSession: Session;
  private fallbackApps = new Set<string>();
  private fallbackTitles = new Set<string>();
  private fallbackUrls = new Set<string>();
  private fallbackFiles = new Set<string>();
  private fallbackIdleTimer: NodeJS.Timeout | null = null;

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

    // Persist session start
    this.store.saveSession(this.currentSession);

    // Subscribe to all activity events
    this.bus.onActivity(async (event: ActivityEvent) => {
      try {
        this.store.saveEvent(event);
      } catch (err) {
        console.error('[ActivityEngine] Failed to save event to database:', err);
      }
      
      try {
        const response = await fetch(`${BACKEND_URL}/session/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        });
        
        if (response.ok) {
          const data: any = await response.json();
          if (data && data.session) {
            const workflowSession = data.session as WorkflowSession;
            console.log(`[ActivityEngine] Received UI update. Name: ${workflowSession.name}, URLs: ${workflowSession.urls.length}`);
            
            // Sync frontend session ID with backend
            if (this.currentSession.id !== workflowSession.id) {
              console.log(`[ActivityEngine] Session boundary crossed. New ID: ${workflowSession.id}`);
              this.currentSession.id = workflowSession.id;
              
              // Update collectors so future events use the new ID
              for (const collector of this.collectors) {
                 if ((collector as any).sessionId) {
                     (collector as any).sessionId = workflowSession.id;
                 }
              }
            }
            
            this.bus.emit('ui-workflow-update', workflowSession);
            
            // Unconditionally embed the session into ChromaDB so Photographic Memory is instantly searchable
            // Do not await this fetch so we don't block the high-frequency event loop
            fetch(`${BACKEND_URL}/memory/embed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(workflowSession)
            }).catch(err => console.error('[ActivityEngine] Live embed failed:', err));
          }
        } else {
          // Silently trigger fallback, since we know the Python backend is currently purely visual
          this.emitFallbackSession(event);
        }
      } catch (err) {
        // Silently trigger fallback
        this.emitFallbackSession(event);
      }
    });

    // Initialize collectors
    const windowCollector = new WindowCollector(this.currentSession.id);
    this.collectors.push(windowCollector);

    for (const collector of this.collectors) {
      await collector.start();
    }
  }

  private generateDynamicName(apps: string[], urls: string[]): string {
    const appsText = apps.join(' ').toLowerCase();
    const urlsText = urls.join(' ').toLowerCase();

    if (appsText.includes('code') || appsText.includes('cursor') || appsText.includes('terminal')) {
        if (urlsText.includes('github') || urlsText.includes('stackoverflow')) {
            return 'Codebase Integration & Troubleshooting';
        }
        if (urlsText.includes('react') || urlsText.includes('node') || urlsText.includes('mdn') || urlsText.includes('developer')) {
            return 'Development & Documentation Review';
        }
        return 'Software Engineering & Architecture';
    }

    if (appsText.includes('figma') || appsText.includes('photoshop') || appsText.includes('design')) {
        return 'Creative Design & Prototyping';
    }

    if (urlsText.includes('youtube') || urlsText.includes('twitch') || urlsText.includes('vimeo')) {
        return 'Media Consumption & Video Research';
    }

    if (urlsText.includes('docs.google') || appsText.includes('word') || appsText.includes('notion') || appsText.includes('obsidian')) {
        return 'Documentation & Strategy Planning';
    }

    if (urlsText.includes('slideshare') || urlsText.includes('presentation') || urlsText.includes('slides')) {
        return 'Presentation & Slide Deck Assembly';
    }

    if (urlsText.includes('mail') || urlsText.includes('slack') || urlsText.includes('discord')) {
        return 'Communication & Team Sync';
    }

    if (appsText.includes('chrome') || appsText.includes('edge') || appsText.includes('browser')) {
        if (urls.length > 0) {
            try {
                const domain = new URL(urls[0]).hostname.replace('www.', '');
                return `Web Exploration: ${domain}`;
            } catch (e) {}
        }
        return 'Ambient Web Exploration';
    }

    if (apps.length > 0) {
        return `Focused Workflow: ${apps[0]}`;
    }

    return 'Ambient Cognitive Context';
  }

  private emitFallbackSession(event: ActivityEvent) {
    const appName = event.payload?.appName || event.payload?.browser;
    const windowTitle = event.payload?.windowTitle || event.payload?.title;
    const url = event.payload?.url;

    if (appName) this.fallbackApps.add(appName);
    if (windowTitle) {
      this.fallbackTitles.add(windowTitle);
      const fileMatch = windowTitle.match(/(?:^|[\\/\s])([a-zA-Z0-9_-]+\.(?:tsx|ts|js|jsx|py|css|html|md|json|txt|cpp|c|h|go|rs))(?:\s|-|$)/i);
      if (fileMatch && fileMatch[1]) {
        this.fallbackFiles.add(fileMatch[1]);
      }
    }
    if (url) this.fallbackUrls.add(url);

    // 1. Emit the LIVE session immediately so the user can see it being built in real-time!
    const liveSession: WorkflowSession = {
        id: this.currentSession.id,
        name: "Capturing Live Context...",
        startTime: this.currentSession.startTime,
        duration: Date.now() - this.currentSession.startTime,
        dominantApps: Array.from(this.fallbackApps),
        windowTitles: Array.from(this.fallbackTitles),
        urls: Array.from(this.fallbackUrls),
        files: Array.from(this.fallbackFiles),
        eventCount: this.currentSession.eventCount,
        status: 'active',
        contextSummary: `Actively capturing ${this.fallbackApps.size} apps and ${this.fallbackUrls.size} urls locally...`,
        probableObjective: 'Live Ambient Monitoring',
        confidenceScore: 0.8,
        relatedSessions: []
    };
    this.bus.emit('ui-workflow-update', liveSession);

    // 2. Set the 15-second idle boundary. If no new events come in for 15 seconds, we SEAL the session using the LLM.
    if (this.fallbackIdleTimer) clearTimeout(this.fallbackIdleTimer);
    this.fallbackIdleTimer = setTimeout(async () => {
      console.log(`[ActivityEngine] Idle timeout reached. Splitting local session boundary.`);
      
      let sessionName = 'Local Captured Context';
      try {
        const res = await fetch('http://127.0.0.1:8000/api/generate-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apps: Array.from(this.fallbackApps),
                urls: Array.from(this.fallbackUrls)
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.name) sessionName = data.name;
        }
      } catch (e) {
        console.log('[ActivityEngine] LLM Naming failed, using fallback.');
      }
      
      // Emit the final sealed session
      const sealedSession: WorkflowSession = {
          ...liveSession,
          name: sessionName,
          duration: Date.now() - this.currentSession.startTime,
          contextSummary: `Captured ${this.fallbackApps.size} apps and ${this.fallbackUrls.size} urls locally`,
      };
      this.bus.emit('ui-workflow-update', sealedSession);

      // Start new session
      this.currentSession.id = uuidv4();
      this.currentSession.startTime = Date.now();
      this.currentSession.eventCount = 0;
      this.fallbackApps.clear();
      this.fallbackTitles.clear();
      this.fallbackUrls.clear();
      this.fallbackFiles.clear();
    }, 120000); // 2-minute idle split
  }

  async searchMemory(query: string) {
    try {
      const response = await fetch(`${BACKEND_URL}/memory/search`, {
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

    for (const collector of this.collectors) {
      await collector.stop();
    }
    
    console.log(`[ActivityEngine] Stopped session: ${this.currentSession.id}`);
  }

  getCurrentSession() {
    return this.currentSession;
  }
}
