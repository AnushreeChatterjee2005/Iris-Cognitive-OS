import uuid
import re
from urllib.parse import urlparse
from typing import List, Dict, Any, Tuple

class ArtifactExtractionEngine:
    def extract_artifacts_and_relationships(self, session: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Extracts artifacts and relationships from a workflow session.
        Returns (artifacts, relationships).
        """
        artifacts = []
        relationships = []
        
        session_id = session.get("id")
        session_name = session.get("name", "Unnamed Session")
        session_time = session.get("startTime", int(uuid.uuid4().time))
        
        urls = session.get("urls", [])
        files = session.get("files", [])
        window_titles = session.get("windowTitles", [])
        dominant_apps = session.get("dominantApps", [])
        context_summary = session.get("contextSummary", "") or ""
        probable_objective = session.get("probableObjective", "") or ""

        # --- Helper for ID generation ---
        def generate_art_id(art_type: str, value: str) -> str:
            # Create a clean, deterministic ID based on value hash
            import hashlib
            val_hash = hashlib.md5(value.encode('utf-8')).hexdigest()[:12]
            return f"art_{art_type}_{val_hash}"

        # 1. --- Extract Browser Artifacts ---
        seen_domains = set()
        for url in urls:
            try:
                parsed = urlparse(url)
                domain = parsed.netloc.replace('www.', '')
                if not domain:
                    continue
                
                # Derive title
                title = domain
                for wt in window_titles:
                    if domain.lower() in wt.lower():
                        # Clean up title (remove trailing app names)
                        title = re.split(r'[-|]', wt)[0].strip()
                        break
                
                if title == domain:
                    # Guess a friendly title from path
                    path_parts = [p for p in parsed.path.split('/') if p]
                    if path_parts:
                        title = f"{path_parts[-1].replace('-', ' ').replace('_', ' ').capitalize()} - {domain}"
                
                # Summarize based on common developer websites
                summary = "Research resource explored during the session."
                domain_lower = domain.lower()
                if "stackoverflow.com" in domain_lower:
                    summary = "Q&A and technical troubleshooting documentation."
                elif "github.com" in domain_lower:
                    summary = "Version control repository and code exploration."
                elif "jwt.io" in domain_lower:
                    summary = "Security resource related to JSON Web Token encoding/decoding."
                elif "daad.de" in domain_lower:
                    summary = "Higher education and academic opportunities research in Germany."
                elif "docker.com" in domain_lower:
                    summary = "Containerization and docker networking configuration documentation."
                elif "npmjs.com" in domain_lower:
                    summary = "NPM Package registry and dependency search."
                elif "chatgpt.com" in domain_lower or "claude.ai" in domain_lower:
                    continue # Conversations are extracted separately below
                
                art_id = generate_art_id("browser", url)
                art = {
                    "id": art_id,
                    "type": "browser_page",
                    "title": title,
                    "value": url,
                    "timestamp": session_time,
                    "summary": summary,
                    "workflow_id": session_id
                }
                artifacts.append(art)
                
                # Add relationship: artifact was used during workflow
                relationships.append({
                    "source_id": art_id,
                    "source_type": "artifact",
                    "target_id": session_id,
                    "target_type": "workflow",
                    "type": "used_during",
                    "timestamp": session_time
                })

                # If this browser page was visited, and it influenced our workflow name/summary
                if any(keyword in session_name.lower() or keyword in context_summary.lower() for keyword in domain.split('.')):
                    relationships.append({
                        "source_id": art_id,
                        "source_type": "artifact",
                        "target_id": session_id,
                        "target_type": "workflow",
                        "type": "influenced",
                        "timestamp": session_time
                    })

                seen_domains.add(domain_lower)
            except Exception as e:
                print(f"[ArtifactExtractionEngine] Error extracting browser URL: {e}")

        # 2. --- Extract File Artifacts ---
        for filepath in files:
            try:
                filename = filepath.split('/')[-1].split('\\')[-1]
                if not filename:
                    continue
                
                # Deduce file purpose
                summary = "Project file read or modified during session."
                filename_lower = filename.lower()
                if "auth" in filename_lower:
                    summary = "Security modules, token verification, and credentials handling."
                elif "docker" in filename_lower:
                    summary = "Docker system environment and containers specification."
                elif "route" in filename_lower or "api" in filename_lower:
                    summary = "Application routing endpoints and server API design."
                elif filename_lower.endswith(".ts") or filename_lower.endswith(".js"):
                    summary = "TypeScript/JavaScript frontend or backend logic implementation."
                elif filename_lower.endswith(".py"):
                    summary = "Python server-side cognitive engine logic implementation."

                art_id = generate_art_id("file", filepath)
                art = {
                    "id": art_id,
                    "type": "file",
                    "title": filename,
                    "value": filepath,
                    "timestamp": session_time + 1000, # slight offset to preserve timeline order
                    "summary": summary,
                    "workflow_id": session_id
                }
                artifacts.append(art)
                
                # Add relationship: file related to workflow
                relationships.append({
                    "source_id": art_id,
                    "source_type": "artifact",
                    "target_id": session_id,
                    "target_type": "workflow",
                    "type": "related_to",
                    "timestamp": session_time
                })

                # Relate browser pages to files (Browser influenced the file)
                for b_art in [a for a in artifacts if a["type"] == "browser_page"]:
                    relationships.append({
                        "source_id": b_art["id"],
                        "source_type": "artifact",
                        "target_id": art_id,
                        "target_type": "artifact",
                        "type": "opened_before" if b_art["timestamp"] <= art["timestamp"] else "opened_after",
                        "timestamp": session_time
                    })
            except Exception as e:
                print(f"[ArtifactExtractionEngine] Error extracting file: {e}")

        # 3. --- Extract Conversation Artifacts ---
        convo_keywords = ["chatgpt", "claude", "slack", "discord", "teams", "copilot"]
        for wt in window_titles:
            wt_lower = wt.lower()
            matching_keyword = next((kw for kw in convo_keywords if kw in wt_lower), None)
            
            if matching_keyword or any(kw in "".join(dominant_apps).lower() for kw in convo_keywords):
                title = "Workspace Chat"
                value = "direct_client"
                
                if "chatgpt" in wt_lower:
                    title = "ChatGPT Intelligence Consultation"
                    value = "https://chatgpt.com"
                elif "claude" in wt_lower:
                    title = "Claude Synthesis Discussion"
                    value = "https://claude.ai"
                elif "discord" in wt_lower:
                    title = "Discord Comm Channel"
                    value = "Discord Client"
                elif "slack" in wt_lower:
                    title = "Slack Team Sync"
                    value = "Slack Workspace"
                
                # Unique hash for conversation title in this session
                art_id = generate_art_id("convo", f"{session_id}_{title}")
                art = {
                    "id": art_id,
                    "type": "conversation",
                    "title": title,
                    "value": value,
                    "timestamp": session_time,
                    "summary": f"Discussion thread centered around: {session_name}.",
                    "workflow_id": session_id
                }
                artifacts.append(art)
                
                # Add relationship: used during workflow
                relationships.append({
                    "source_id": art_id,
                    "source_type": "artifact",
                    "target_id": session_id,
                    "target_type": "workflow",
                    "type": "used_during",
                    "timestamp": session_time
                })

        # 4. --- Infer Discovery / Milestone Artifacts ---
        # Generate specific milestone based on subject matter
        subject = session_name.replace("Implementing ", "").replace("Debugging ", "").replace("Researching ", "").strip()
        
        milestone_title = f"Discovery: Completed {subject}"
        milestone_summary = f"Successfully consolidated research and implemented changes for {subject}."
        
        if "auth" in session_name.lower() or "jwt" in session_name.lower():
            milestone_title = "Found JWT/Auth Solution"
            milestone_summary = "Resolved authentication workflow using secure token validation and local encryption."
        elif "docker" in session_name.lower() or "networking" in session_name.lower():
            milestone_title = "Resolved Docker Networking Issue"
            milestone_summary = "Fixed container configuration and bridge connection limits to re-establish workspace continuity."
        elif "germany" in session_name.lower() or "universities" in session_name.lower():
            milestone_title = "Compiled German University Shortlist"
            milestone_summary = "Evaluated admission criteria, deadlines, and requirements on DAAD database."
        elif "cinema" in session_name.lower() or "overlay" in session_name.lower() or "animation" in session_name.lower():
            milestone_title = "Perfected Cinematic Ambient Ripple"
            milestone_summary = "Engineered custom GPU-accelerated transition overlays for fluid Cmd+K hotkey responsiveness."
        
        disc_id = generate_art_id("discovery", f"{session_id}_milestone")
        discovery_art = {
            "id": disc_id,
            "type": "discovery",
            "title": milestone_title,
            "value": "milestone_inferred",
            "timestamp": session_time + 5000, # towards the end of session
            "summary": milestone_summary,
            "workflow_id": session_id
        }
        artifacts.append(discovery_art)
        
        # Add relationships
        relationships.append({
            "source_id": session_id,
            "source_type": "workflow",
            "target_id": disc_id,
            "target_type": "artifact",
            "type": "influenced",
            "timestamp": session_time
        })
        
        # Relate files/browser to the discovery
        for art in [a for a in artifacts if a["type"] in ["file", "browser_page"]]:
            relationships.append({
                "source_id": art["id"],
                "source_type": "artifact",
                "target_id": disc_id,
                "target_type": "artifact",
                "type": "influenced",
                "timestamp": session_time
            })

        return artifacts, relationships
