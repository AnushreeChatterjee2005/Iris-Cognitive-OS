import sqlite3
import os
import json
from typing import List, Dict, Any, Optional

DB_DIR = os.path.join(os.getcwd(), ".iris_chroma_db")
DB_PATH = os.path.join(DB_DIR, "cognitive_graph.db")

class GraphMemoryStore:
    def __init__(self):
        os.makedirs(DB_DIR, exist_ok=True)
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self):
        cursor = self.conn.cursor()
        
        # Workflows table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                duration INTEGER DEFAULT 0,
                context_summary TEXT,
                probable_objective TEXT,
                confidence_score REAL DEFAULT 0.0,
                event_count INTEGER DEFAULT 0,
                status TEXT NOT NULL
            )
        """)
        
        # Artifacts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL, -- 'browser_page', 'file', 'conversation', 'discovery'
                title TEXT NOT NULL,
                value TEXT NOT NULL, -- URL, filepath, domain, etc.
                timestamp INTEGER NOT NULL,
                summary TEXT,
                workflow_id TEXT,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
        """)
        
        # Relationships table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                source_type TEXT NOT NULL, -- 'workflow', 'artifact'
                target_id TEXT NOT NULL,
                target_type TEXT NOT NULL, -- 'workflow', 'artifact'
                type TEXT NOT NULL, -- 'related_to', 'opened_before', 'opened_after', 'used_during', 'influenced', 'revisited_in'
                timestamp INTEGER NOT NULL,
                UNIQUE(source_id, target_id, type)
            )
        """)
        
        # Indices for fast queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_workflows_start ON workflows(start_time)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_artifacts_workflow ON artifacts(workflow_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_artifacts_timestamp ON artifacts(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id)")
        
        self.conn.commit()

    def add_workflow(self, w: Dict[str, Any]):
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO workflows 
            (id, name, start_time, end_time, duration, context_summary, probable_objective, confidence_score, event_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            w.get("id"),
            w.get("name", "Unnamed Workflow"),
            w.get("startTime"),
            w.get("endTime"),
            w.get("duration", 0),
            w.get("contextSummary"),
            w.get("probableObjective"),
            w.get("confidenceScore", 0.0),
            w.get("eventCount", 0),
            w.get("status", "active")
        ))
        self.conn.commit()

    def add_artifact(self, art: Dict[str, Any]):
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO artifacts 
            (id, type, title, value, timestamp, summary, workflow_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            art.get("id"),
            art.get("type"),
            art.get("title"),
            art.get("value"),
            art.get("timestamp"),
            art.get("summary"),
            art.get("workflow_id")
        ))
        self.conn.commit()

    def add_relationship(self, source_id: str, source_type: str, target_id: str, target_type: str, rel_type: str, timestamp: int):
        cursor = self.conn.cursor()
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO relationships 
                (source_id, source_type, target_id, target_type, type, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (source_id, source_type, target_id, target_type, rel_type, timestamp))
            self.conn.commit()
        except sqlite3.Error as e:
            print(f"[GraphMemoryStore] Error adding relationship: {e}")

    def get_workflow(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_workflow_artifacts(self, workflow_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM artifacts WHERE workflow_id = ?", (workflow_id,))
        return [dict(row) for row in cursor.fetchall()]

    def get_all_workflows_chronologically(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM workflows ORDER BY start_time ASC")
        return [dict(row) for row in cursor.fetchall()]

    def get_workflows_in_range(self, start_t: int, end_t: int) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM workflows WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC", (start_t, end_t))
        return [dict(row) for row in cursor.fetchall()]

    def get_relationships_for(self, entity_id: str) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM relationships 
            WHERE source_id = ? OR target_id = ?
        """, (entity_id, entity_id))
        return [dict(row) for row in cursor.fetchall()]

    def get_all_artifacts(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM artifacts ORDER BY timestamp DESC")
        return [dict(row) for row in cursor.fetchall()]

    def get_artifacts_in_range(self, start_t: int, end_t: int) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM artifacts WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC", (start_t, end_t))
        return [dict(row) for row in cursor.fetchall()]

    def get_all_data(self) -> Dict[str, Any]:
        cursor = self.conn.cursor()
        
        # Get workflows
        cursor.execute("SELECT id, name as title, 'workflow' as type FROM workflows")
        workflows = [dict(row) for row in cursor.fetchall()]
        
        # Get artifacts
        cursor.execute("SELECT id, title, type, workflow_id FROM artifacts")
        artifacts = [dict(row) for row in cursor.fetchall()]
        
        nodes = []
        edges = []
        
        for w in workflows:
            nodes.append({"id": w["id"], "title": w["title"], "group": "session"})
            
        for a in artifacts:
            nodes.append({"id": a["id"], "title": a["title"], "group": a["type"], "workflow_id": a.get("workflow_id")})
            if a.get("workflow_id"):
                edges.append({"source": a["id"], "target": a["workflow_id"]})
                
        # Also grab relationships if they exist
        cursor.execute("SELECT source_id, target_id FROM relationships")
        rels = cursor.fetchall()
        for r in rels:
            edges.append({"source": r["source_id"], "target": r["target_id"]})
            
        return {"nodes": nodes, "edges": edges}

    def close(self):
        self.conn.close()
