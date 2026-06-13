import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { ActivityEvent, Session } from '../../shared/types';
import { fileURLToPath } from 'url';

// =============================================================================
// IRIS Activity Store
// =============================================================================
// Persists activity events to a local SQLite database using sql.js.
// Manages schema initialization and event insertion.
// =============================================================================

export class ActivityStore {
  private db: any;
  private dbPath: string;
  private SQL: any;

  constructor(userDataPath: string) {
    this.dbPath = path.join(userDataPath, 'iris.sqlite');
  }

  async init() {
    if (typeof (global as any).__dirname === 'undefined') {
      (global as any).__dirname = path.dirname(fileURLToPath(import.meta.url));
    }
    
    this.SQL = await initSqlJs({
      locateFile: file => path.join((global as any).__dirname, '../node_modules/sql.js/dist', file)
    });
    
    if (fs.existsSync(this.dbPath)) {
      console.log(`[ActivityStore] Loading existing database from ${this.dbPath}`);
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      console.log(`[ActivityStore] Creating new database at ${this.dbPath}`);
      this.db = new this.SQL.Database();
    }
    
    // Always ensure schema exists (safe because of IF NOT EXISTS)
    this.createSchema();
    this.persist();
  }

  private createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        startTime INTEGER,
        endTime INTEGER,
        hostname TEXT,
        platform TEXT,
        eventCount INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT,
        source TEXT,
        timestamp INTEGER,
        duration INTEGER,
        sessionId TEXT,
        appName TEXT,
        windowTitle TEXT,
        payload TEXT,
        FOREIGN KEY(sessionId) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(sessionId);
    `);
  }

  saveSession(session: Session) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, startTime, endTime, hostname, platform, eventCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run([session.id, session.startTime, session.endTime || null, session.hostname, session.platform, session.eventCount]);
    stmt.free();
    this.persist();
  }

  saveEvent(event: ActivityEvent) {
    const appName = (event.payload as any).appName || (event.payload as any).browser || '';
    const windowTitle = (event.payload as any).windowTitle || (event.payload as any).title || '';
    
    const stmt = this.db.prepare(`
      INSERT INTO events (id, type, source, timestamp, duration, sessionId, appName, windowTitle, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([
      event.id,
      event.type,
      event.source,
      event.timestamp,
      event.duration || null,
      event.sessionId,
      appName,
      windowTitle,
      JSON.stringify(event.payload)
    ]);
    stmt.free();

    // Increment session event count
    this.db.run("UPDATE sessions SET eventCount = eventCount + 1 WHERE id = ?", [event.sessionId]);
    
    this.persist();
  }

  getRecentEvents(limit: number = 100): ActivityEvent[] {
    const res = this.db.exec("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?", [limit]);
    if (res.length === 0) return [];
    
    const columns = res[0].columns;
    return res[0].values.map((row: any[]) => {
      const rowObj: any = {};
      columns.forEach((col: string, i: number) => rowObj[col] = row[i]);
      
      return {
        id: rowObj.id,
        type: rowObj.type,
        source: rowObj.source,
        timestamp: rowObj.timestamp,
        duration: rowObj.duration,
        sessionId: rowObj.sessionId,
        payload: JSON.parse(rowObj.payload)
      } as ActivityEvent;
    });
  }

  private persist() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (e) {
      console.error("[ActivityStore] Failed to persist database:", e);
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
