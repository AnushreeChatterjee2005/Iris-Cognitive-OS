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
      this.store.saveEvent(event);
      
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
          console.error(`[ActivityEngine] Backend returned error: ${response.status} ${response.statusText}`);
          const errorText = await response.text();
          console.error(`[ActivityEngine] Error details:`, errorText);
        }
      } catch (err) {
        console.error('[ActivityEngine] Failed to send event to Cognitive Backend:', err);
      }
    });

    // Initialize collectors
    const windowCollector = new WindowCollector(this.currentSession.id);
    this.collectors.push(windowCollector);

    for (const collector of this.collectors) {
      await collector.start();
    }
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
