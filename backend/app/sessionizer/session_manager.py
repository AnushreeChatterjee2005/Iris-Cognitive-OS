import time
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from app.workflow_engine.inference import InferenceEngine

class SessionManager:
    def __init__(self):
        self.current_session: Optional[Dict[str, Any]] = None
        self.session_events: List[Dict[str, Any]] = []
        self.inference_engine = InferenceEngine()
        self.IDLE_THRESHOLD_MS = 10 * 60 * 1000  # 10 minutes

    def process_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        # 1. Evaluate boundaries
        if self.current_session and self._should_break_session(event):
            self._close_current_session()

        # 2. Start new or extend
        if not self.current_session:
            self._start_new_session(event)
        else:
            self._extend_session(event)

        return self.current_session

    def get_current_session(self) -> Optional[Dict[str, Any]]:
        return self.current_session

    def _should_break_session(self, event: Dict[str, Any]) -> bool:
        if not self.current_session:
            return False

        now = int(time.time() * 1000)
        event_time = event.get('timestamp', now)
        last_event = self.session_events[-1]
        idle_time = event_time - last_event.get('timestamp', now)

        # SIGNAL 1: Time Continuity
        if idle_time > self.IDLE_THRESHOLD_MS:
            return True

        # SIGNAL 2: Explicit User Intent (Ctrl+Shift+K)
        if event.get('type') in ['user.intent_anchor', 'anchor_intent']:
            print(f"[SessionManager] Immediate boundary detected: Explicit User Intent Anchor received.")
            return True

        # SIGNAL 3: High-Fidelity App Category Context Switch (Immediate Split)
        payload = event.get('payload', {})
        new_app = (payload.get('appName') or payload.get('browser') or '').lower()
        current_apps = [a.lower() for a in self.current_session.get('dominantApps', [])]

        def get_category(app_name):
            app_name = app_name.lower()
            if any(x in app_name for x in ['blender', 'unity', 'unreal', 'maya', '3dsmax']):
                return '3d_creative'
            if any(x in app_name for x in ['notion', 'obsidian', 'onenote', 'word', 'excel', 'powerpoint']):
                return 'docs'
            if any(x in app_name for x in ['code', 'cursor', 'terminal', 'powershell', 'cmd', 'electron', 'codex']):
                return 'dev'
            if any(x in app_name for x in ['spotify', 'netflix', 'youtube', 'steam', 'discord', 'music']):
                return 'entertainment'
            return 'general'

        new_cat = get_category(new_app)
        current_cats = [get_category(a) for a in current_apps if get_category(a) != 'general']

        if current_cats and new_cat != 'general':
            from collections import Counter
            dominant_cat = Counter(current_cats).most_common(1)[0][0]
            # Immediate split on clean context boundary shifts
            if dominant_cat != new_cat:
                print(f"[SessionManager] Immediate boundary detected: category switched from '{dominant_cat}' to '{new_cat}' (New App: {new_app})")
                return True

        # Legacy Split Signal (Time Continuity & Semantic Drift fallback)
        if idle_time > 5 * 60 * 1000:
            return True

        new_title = (payload.get('windowTitle') or payload.get('title') or '').lower()
        if new_title and self.current_session.get('windowTitles'):
            keywords = [w for w in new_title.split() if len(w) > 4]
            session_keywords = self.current_session.get('name', '').lower().split()
            has_overlap = any(any(sk in k or k in sk for sk in session_keywords) for k in keywords)
            if len(keywords) > 2 and not has_overlap and idle_time > 3 * 60 * 1000:
                if 'chrome' not in new_app and 'terminal' not in new_app:
                    return True

        return False

    def _start_new_session(self, event: Dict[str, Any]):
        session_id = str(uuid.uuid4())
        self.session_events = [event]
        self.current_session = {
            "id": session_id,
            "name": "New Workflow",
            "startTime": event.get('timestamp', int(time.time() * 1000)),
            "duration": 0,
            "dominantApps": [],
            "windowTitles": [],
            "urls": [],
            "files": [],
            "eventCount": 1,
            "status": "active",
            "contextSummary": "Detecting intent...",
            "probableObjective": "Establishing cognitive baseline...",
            "confidenceScore": 0.1,
            "relatedSessions": []
        }
        self._update_session_intelligence()

    def _extend_session(self, event: Dict[str, Any]):
        if not self.current_session:
            return

        self.session_events.append(event)
        ts = event.get('timestamp', int(time.time() * 1000))
        self.current_session['endTime'] = ts
        self.current_session['duration'] = ts - self.current_session['startTime']
        self.current_session['eventCount'] = len(self.session_events)

        self._update_session_intelligence()

    def _update_session_intelligence(self):
        if not self.current_session:
            return

        self.current_session['name'] = self.inference_engine.infer_workflow_name(self.session_events)
        self.current_session['contextSummary'] = self.inference_engine.generate_summary(self.session_events)
        self.current_session['probableObjective'] = self.inference_engine.infer_probable_objective(self.session_events)

        events_score = min(len(self.session_events) / 50.0, 0.4)
        duration_score = min(self.current_session['duration'] / (30 * 60 * 1000.0), 0.5)
        self.current_session['confidenceScore'] = min(0.1 + events_score + duration_score, 1.0)

        # Aggregate metadata (increased caps to support massive complex sessions)
        apps = self.inference_engine._get_unique_apps(self.session_events)[:20]
        titles = self.inference_engine._get_unique_titles(self.session_events)[:50]
        urls = self.inference_engine._get_unique_urls(self.session_events)[:50]
        files = self.inference_engine._get_unique_files(self.session_events)[:50]

        self.current_session['dominantApps'] = apps
        self.current_session['windowTitles'] = titles
        self.current_session['urls'] = urls
        self.current_session['files'] = files

    def _close_current_session(self):
        if not self.current_session:
            return
        self.current_session['status'] = 'closed'
        self._update_session_intelligence()
        # In a real system, we might emit this via webhook or callback to Electron,
        # and embed it via MemoryEngine.
        self.current_session = None
        self.session_events = []
