import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEvent, EventType, CollectorSource } from '../../shared/types';
import { EventBus } from './EventBus';

// =============================================================================
// IRIS Activity Gateway
// =============================================================================
// A lightweight HTTP server that acts as the entry point for "Internal"
// collectors like Browser extensions and IDE plugins.
// =============================================================================

export class ActivityGateway {
  private server: http.Server;
  private port: number = 32000; // Standard IRIS gateway port
  private bus: EventBus;
  private sessionId: string;

  constructor(sessionId: string) {
    this.bus = EventBus.getInstance();
    this.sessionId = sessionId;
    
    this.server = http.createServer((req, res) => {
      // Handle CORS for browser extensions
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/activity') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            this.handleIncomingActivity(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch (e) {
            res.writeHead(400);
            res.end('Invalid JSON');
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  }

  start() {
    this.server.on('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        console.error(`[ActivityGateway] Port ${this.port} is already in use. External collectors will be disabled.`);
      } else {
        console.error(`[ActivityGateway] Server error:`, e);
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[ActivityGateway] Listening for external collectors on port ${this.port}`);
    });
  }

  stop() {
    this.server.close();
  }

  private handleIncomingActivity(data: any) {
    // Map external data to our normalized ActivityEvent schema
    const event: ActivityEvent = {
      id: uuidv4(),
      type: data.type as EventType,
      source: data.source as CollectorSource,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      payload: data.payload,
      raw: data
    };

    console.log(`[ActivityGateway] Received external event: ${event.type} from ${event.source}`);
    this.bus.publish(event);
  }
}
