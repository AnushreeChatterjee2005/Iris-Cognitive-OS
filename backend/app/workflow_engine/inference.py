from urllib.parse import urlparse
from typing import List, Dict, Any
import requests
import time
import os

class InferenceEngine:
    def __init__(self):
        self._cached_ai_titles = {} # maps session_id to cached AI title
        self._last_ai_check = 0.0

    def _load_env_keys(self) -> Dict[str, str]:
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
        keys = {}
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            parts = line.split("=", 1)
                            keys[parts[0].strip()] = parts[1].strip().replace('"', '').replace("'", "")
            except Exception:
                pass
        for k in ["GROQ_API_KEY"]:
            if k in os.environ:
                keys[k] = os.environ[k]
        return keys

    def _infer_workflow_name_groq(self, api_key: str, apps: List[str], titles: List[str], urls: List[str], files: List[str]) -> Any:
        clean_files = [f.split('/')[-1].split('\\')[-1] for f in files if f]
        context = f"""
Unique Apps: {', '.join(apps)}
Recent Windows: {', '.join(titles[:4])}
Recent URLs: {', '.join(urls[:4])}
Recent Files: {', '.join(clean_files[:4])}
        """.strip()

        prompt = f"""
You are the title synthesizer for a premium developer memory prosthetic called IRIS.
Analyze the user's active resources and generate a short, literal, 100% accurate, and professional title (3 to 5 words max).

Rules:
1. Do NOT hallucinate wild integrations. Base the title strictly on the provided Unique Apps, Windows, URLs, and Files.
2. If the context is mostly empty or generic (e.g., just the OS, empty desktop, or only "IRIS"), output exactly: "Ambient Flow"
3. Keep it technical, clean, and direct. Use 3-5 words.

Context:
{context}

Response (3-5 words max, plain text, no quotes):"""

        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 15
            }
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json=payload,
                headers=headers,
                timeout=2.0
            )
            if res.status_code == 200:
                data = res.json()
                title = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip().replace('"', '').replace("'", "")
                if title and len(title.split()) <= 6:
                    return title
        except Exception as e:
            print(f"[InferenceEngine] Groq API query failed: {e}")
        return None

    def _infer_workflow_name_ai(self, apps: List[str], titles: List[str], urls: List[str], files: List[str]) -> Any:
        try:
            res = requests.get("http://localhost:11434/api/tags", timeout=0.3)
            if res.status_code != 200:
                return None
            models = res.json().get("models", [])
            if not models:
                return None
            model = models[0]["name"]
        except Exception:
            return None

        clean_files = [f.split('/')[-1].split('\\')[-1] for f in files if f]
        context = f"""
Unique Apps: {', '.join(apps)}
Recent Windows: {', '.join(titles[:4])}
Recent URLs: {', '.join(urls[:4])}
Recent Files: {', '.join(clean_files[:4])}
        """.strip()

        prompt = f"""
You are the title synthesizer for a premium developer memory prosthetic called IRIS.
Analyze the user's active resources and generate a short, literal, 100% accurate, and professional title (3 to 5 words max).

Rules:
1. Do NOT hallucinate wild integrations. Base the title strictly on the provided Unique Apps, Windows, URLs, and Files.
2. If the context is mostly empty or generic (e.g., just the OS, empty desktop, or only "IRIS"), output exactly: "Ambient Flow"
3. Keep it technical, clean, and direct. Use 3-5 words.

Context:
{context}

Response (3-5 words max, plain text, no quotes):"""

        try:
            res = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 10
                    }
                },
                timeout=1.5
            )
            if res.status_code == 200:
                title = res.json().get("response", "").strip().replace('"', '').replace("'", "")
                if title and len(title.split()) <= 6:
                    return title
        except Exception as e:
            print(f"[InferenceEngine] Dynamic AI naming failed: {e}")
        return None

    def infer_workflow_name(self, events: List[Dict[str, Any]]) -> str:
        if not events:
            return "Quiet Reflection"

        session_id = events[0].get('sessionId', 'default')

        # 0. Check for explicit user intent anchors first (Cognitive Steering)
        for event in reversed(events):
            if event.get('type') == 'user.intent_anchor':
                intent = event.get('payload', {}).get('intent')
                if intent:
                    # Clear any cached AI title so it doesn't override the anchor later if the anchor is removed
                    self._cached_ai_titles[session_id] = intent
                    return intent

        apps = self._get_unique_apps(events)
        titles = self._get_unique_titles(events)
        urls = self._get_unique_urls(events)
        files = self._get_unique_files(events)

        # 1. Throttled dynamic AI Model Title Generation
        now = time.time()
        should_check_ai = (
            len(events) >= 4 and 
            (len(events) % 8 == 0 or session_id not in self._cached_ai_titles) and
            (now - self._last_ai_check) > 10.0
        )

        if should_check_ai:
            self._last_ai_check = now
            
            keys = self._load_env_keys()
            groq_key = keys.get("GROQ_API_KEY")
            
            ai_title = None
            if groq_key:
                print("[InferenceEngine] Querying Groq API for dynamic title...")
                ai_title = self._infer_workflow_name_groq(groq_key, apps, titles, urls, files)
            
            if not ai_title:
                ai_title = self._infer_workflow_name_ai(apps, titles, urls, files)
                
            if ai_title:
                print(f"[InferenceEngine] Synthesized Dynamic AI Card Title: '{ai_title}'")
                self._cached_ai_titles[session_id] = ai_title
                return ai_title
            else:
                if groq_key:
                    print("[InferenceEngine] Groq API query failed or was empty. Using fast heuristic fallback.")
                else:
                    print("[InferenceEngine] Groq API key not configured, and local Ollama is offline. Using fast heuristic fallback.")

        # Return cached title if present
        if session_id in self._cached_ai_titles:
            return self._cached_ai_titles[session_id]

        # 2. Heuristic fallback
        subject = self._identify_subject(titles, apps, files)
        
        apps_lower = [a.lower() for a in apps]
        if 'blender' in apps_lower:
            return f"Designing in Blender" if not subject else f"Modeling in Blender: {subject}"
        if 'notion' in apps_lower:
            return f"Documenting in Notion" if not subject else f"Notion: {subject}"
        if 'obsidian' in apps_lower:
            return f"Organizing in Obsidian" if not subject else f"Obsidian: {subject}"

        if 'Code' in apps or 'VS Code' in apps or 'Cursor' in apps or 'Codex' in apps or files or 'electron' in apps:
            if subject:
                return f"Implementing {subject}"
            return "Building Software Architecture"

        if urls or 'chrome' in apps or 'Chrome' in apps or 'Safari' in apps:
            if subject:
                return f"Researching {subject}"
            domain = self._get_dominant_domain(urls)
            if domain:
                return f"Deep Dive into {domain}"
            return "Information Synthesis"

        if 'Slack' in apps or 'Discord' in apps or 'Teams' in apps or 'Mail' in apps:
            return "Collaborative Coordination"

        return subject if subject else "Focused Flow State"

    def generate_summary(self, events: List[Dict[str, Any]]) -> str:
        titles = self._get_unique_titles(events)
        if not titles:
            return "Gathering context for your workflow."

        top_title = titles[0][:50] + "..." if len(titles[0]) > 50 else titles[0]
        secondary_title = titles[1][:50] + "..." if len(titles) > 1 and len(titles[1]) > 50 else (titles[1] if len(titles) > 1 else None)

        if secondary_title:
            return f"You were exploring {top_title} and cross-referencing {secondary_title}."
        
        return f"You were deeply focused on {top_title}."

    def infer_probable_objective(self, events: List[Dict[str, Any]]) -> str:
        apps = self._get_unique_apps(events)
        titles = self._get_unique_titles(events)
        files = self._get_unique_files(events)
        subject = self._identify_subject(titles, apps, files)
        
        if subject and len(subject) > 50:
            subject = subject[:50] + "..."

        if 'Code' in apps or 'Codex' in apps or 'Cursor' in apps or files:
            return f"Trying to build or debug {subject or 'the codebase'}"
        
        if any('browser' in a.lower() or 'chrome' in a.lower() for a in apps):
            return f"Gathering information about {subject or 'a specific topic'}"
            
        return f"Progressing on {subject or 'current task'}"

    # Helper methods
    def _get_unique_apps(self, events: List[Dict[str, Any]]) -> List[str]:
        apps = []
        seen = set()
        for e in events:
            payload = e.get('payload', {})
            app = payload.get('appName') or payload.get('browser')
            if app:
                app_lower = app.lower()
                if app_lower not in seen:
                    seen.add(app_lower)
                    apps.append(app.capitalize() if app_lower != 'vs code' else 'VS Code')
        return apps

    def _get_unique_titles(self, events: List[Dict[str, Any]]) -> List[str]:
        titles = []
        for e in events:
            payload = e.get('payload', {})
            t = payload.get('windowTitle') or payload.get('title')
            if t and 'New Tab' not in t and 'Google Search' not in t and t not in titles:
                titles.append(t)
        return titles

    def _get_unique_urls(self, events: List[Dict[str, Any]]) -> List[str]:
        urls = []
        for e in events:
            url = e.get('payload', {}).get('url')
            if url and url not in urls:
                urls.append(url)
        return urls

    def _get_unique_files(self, events: List[Dict[str, Any]]) -> List[str]:
        files = []
        for e in events:
            f = e.get('payload', {}).get('filePath')
            if f and f not in files:
                files.append(f)
        return files

    def _identify_subject(self, titles: List[str], apps: List[str], files: List[str]) -> str:
        if files:
            file_name = files[0].split('/')[-1].split('\\')[-1]
            clean = file_name.replace('.ts', '').replace('.js', '').replace('.html', '').replace('.py', '').replace('.tsx', '').replace('.css', '')
            if clean.lower() == 'index':
                parts = [p for p in files[0].split('/') + files[0].split('\\') if p]
                if len(parts) > 1:
                    return f"{parts[-2]} Page"
            return clean.capitalize()

        creative_apps = {
            'blender': '3D Asset Modeling',
            'notion': 'Notion Workspace',
            'obsidian': 'Knowledge Vault',
            'spotify': 'Ambient Music',
            'discord': 'Developer Chat'
        }
        for app in apps:
            app_lower = app.lower()
            if app_lower in creative_apps:
                return creative_apps[app_lower]

        for t in titles:
            t_lower = t.lower()
            if 'google chrome' in t_lower or 'browser' in t_lower or 'brave' in t_lower or 'edge' in t_lower:
                t_clean = t.replace(' - Google Chrome', '').replace(' - Brave', '').replace(' - Microsoft Edge', '')
                if 'github' in t_clean.lower():
                    if '/' in t_clean:
                        parts = t_clean.split('/')
                        repo = parts[-1].split(' ')[0].strip()
                        return f"GitHub Repo: {repo}"
                    return "GitHub Research"
                if 'chatgpt' in t_clean.lower():
                    return "AI Consultations"
                if 'stack overflow' in t_clean.lower() or 'stackoverflow' in t_clean.lower():
                    return "StackOverflow Solutions"
                
                import re
                parts = re.split(r'[-|]', t_clean)
                if parts and len(parts[0].strip()) > 3:
                    sub = parts[0].strip()
                    return sub[:40] + "..." if len(sub) > 40 else sub
            
            if len(t) > 5 and 'electron' not in t_lower:
                import re
                parts = re.split(r'[-|]', t)
                if parts and len(parts[0].strip()) > 3:
                    sub = parts[0].strip()
                    return sub[:40] + "..." if len(sub) > 40 else sub
        return None

    def _get_dominant_domain(self, urls: List[str]) -> str:
        if not urls:
            return None
        domains = {}
        for url in urls:
            try:
                domain = urlparse(url).netloc.replace('www.', '')
                domains[domain] = domains.get(domain, 0) + 1
            except:
                pass
        if domains:
            return sorted(domains.items(), key=lambda x: x[1], reverse=True)[0][0]
        return None
