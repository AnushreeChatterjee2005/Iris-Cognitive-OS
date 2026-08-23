import http from 'http';
import { readFileSync } from 'fs';
import { timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEvent } from '../shared/types';
import { EventBus } from './EventBus';
import { launchTokenPath } from '../backendClient';
import {
  IncomingActivity,
  isIncomingActivity,
  isValidActivityOrigin,
  TRUSTED_EXTENSION_ORIGIN,
} from './activityValidation';
import { ACTIVITY_GATEWAY_PORT } from '../config';

const MAX_ACTIVITY_BODY_BYTES = 64 * 1024;
function readLaunchToken(): string | null {
  try {
    return readFileSync(launchTokenPath, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function tokensMatch(supplied: string | undefined, expected: string): boolean {
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

// =============================================================================
// IRIS Activity Gateway
// =============================================================================
// A lightweight HTTP server that acts as the entry point for "Internal"
// collectors like Browser extensions and IDE plugins.
// =============================================================================

export class ActivityGateway {
  private server: http.Server;
  private port: number = ACTIVITY_GATEWAY_PORT;
  private bus: EventBus;
  private sessionId: string;

  constructor(sessionId: string) {
    this.bus = EventBus.getInstance();
    this.sessionId = sessionId;
    
    this.server = http.createServer((req, res) => {
      const origin = req.headers.origin;
      const trustedExtensionOrigin = isValidActivityOrigin(origin);
      if (!trustedExtensionOrigin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Untrusted request origin.' }));
        return;
      }

      // Browser-originated activity is accepted only from the bundled extension.
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-IRIS-Token');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url === '/session-token' && origin === TRUSTED_EXTENSION_ORIGIN) {
        const launchToken = readLaunchToken();
        if (!launchToken) {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ status: 'error', message: 'IRIS backend is starting.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ token: launchToken }));
        return;
      }

      if (req.method === 'POST' && req.url === '/activity') {
        const launchToken = readLaunchToken();
        const suppliedToken = Array.isArray(req.headers['x-iris-token'])
          ? req.headers['x-iris-token'][0]
          : req.headers['x-iris-token'];
        if (!launchToken || !tokensMatch(suppliedToken, launchToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Authentication required.' }));
          return;
        }
        const contentType = req.headers['content-type'] || '';
        if (!contentType.toLowerCase().startsWith('application/json')) {
          res.writeHead(415, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Content-Type must be application/json.' }));
          return;
        }

        let body = '';
        let bodyBytes = 0;
        let bodyRejected = false;
        req.on('data', chunk => {
          if (bodyRejected) return;
          bodyBytes += chunk.length;
          if (bodyBytes > MAX_ACTIVITY_BODY_BYTES) {
            bodyRejected = true;
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: 'Activity payload is too large.' }));
            return;
          }
          body += chunk.toString('utf8');
        });
        req.on('end', () => {
          if (bodyRejected) return;
          try {
            const data: unknown = JSON.parse(body);
            if (!isIncomingActivity(data)) {
              res.writeHead(422, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'error', message: 'Invalid activity event.' }));
              return;
            }
            this.handleIncomingActivity(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON.' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  }

  start() {
    this.server.on('error', (error: Error & { code?: string }) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[ActivityGateway] Port ${this.port} is already in use. External collectors will be disabled.`);
      } else {
        console.error(`[ActivityGateway] Server error:`, error);
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[ActivityGateway] Listening for external collectors on port ${this.port}`);
    });
  }

  stop() {
    this.server.close();
  }

  private handleIncomingActivity(data: IncomingActivity) {
    // Map external data to our normalized ActivityEvent schema
    const event: ActivityEvent = {
      id: uuidv4(),
      type: data.type,
      source: data.source,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      payload: data.payload,
      raw: data as unknown as Record<string, unknown>
    };

    console.log(`[ActivityGateway] Received external event: ${event.type} from ${event.source}`);
    this.bus.publish(event);
  }
}
