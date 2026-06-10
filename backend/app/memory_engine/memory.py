from sentence_transformers import SentenceTransformer
from app.vector_store.chroma_db import ChromaVectorStore
from app.vector_store.graph_db import GraphMemoryStore
from app.memory_engine.artifact_extractor import ArtifactExtractionEngine
from app.models.schemas import WorkflowSession
import time
import re
import requests
from typing import List, Dict, Any, Tuple, Optional

class MemoryEngine:
    def __init__(self):
        print("[MemoryEngine] Loading local sentence-transformer model...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.vector_store = ChromaVectorStore()
        self.graph_store = GraphMemoryStore()
        self.artifact_extractor = ArtifactExtractionEngine()
        self.synthesizer = AICognitiveSynthesizer()
        print("[MemoryEngine] Upgraded cognitive recall layer initialized.")

    def embed_session(self, session: WorkflowSession):
        # 1. Store session in relational/graph DB
        session_dict = session.dict()
        self.graph_store.add_workflow(session_dict)

        # 2. Embed session in Chroma Vector DB
        text_to_embed = f"""
        Title: {session.name}
        Objective: {session.probableObjective or ''}
        Summary: {session.contextSummary or ''}
        Apps: {', '.join(session.dominantApps)}
        Resources: {' '.join(session.windowTitles)}
        """.strip()

        embedding = self.model.encode(text_to_embed).tolist()
        
        metadata = {
            "name": session.name,
            "summary": session.contextSummary,
            "objective": session.probableObjective,
            "startTime": session.startTime,
            "duration": session.duration,
            "apps": session.dominantApps,
            "confidenceScore": session.confidenceScore
        }

        self.vector_store.add_memory(session.id, embedding, metadata)

        # 3. Extract and embed artifacts unconditionally for LIVE photographic memory
        artifacts, relationships = self.artifact_extractor.extract_artifacts_and_relationships(session_dict)
        
        # Save artifacts and relationships in Graph DB
        for art in artifacts:
            self.graph_store.add_artifact(art)
            
            # Embed artifact in Chroma for semantic discovery
            art_text = f"Type: {art['type']} | Title: {art['title']} | Summary: {art['summary']} | Value: {art['value']}"
            art_embedding = self.model.encode(art_text).tolist()
            
            self.vector_store.add_artifact_memory(art["id"], art_embedding, art)
            
        for rel in relationships:
            self.graph_store.add_relationship(
                source_id=rel["source_id"],
                source_type=rel["source_type"],
                target_id=rel["target_id"],
                target_type=rel["target_type"],
                rel_type=rel["type"],
                timestamp=rel["timestamp"]
            )
        
        print(f"[MemoryEngine] Extracted {len(artifacts)} artifacts and {len(relationships)} relationships.")

        return {"sessionId": session.id, "status": "embedded"}

    def _parse_temporal_query(self, query: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Parses queries like 'before implementing auth' or 'after debugging Docker'.
        Returns (preposition, topic).
        """
        query_lower = query.lower()
        prepositions = ["before", "after", "during", "what led me to", "helped me solve", "connected to"]
        found_prep = None
        
        for prep in prepositions:
            if prep in query_lower:
                found_prep = prep
                break
                
        if not found_prep:
            return None, None
            
        # Extract the trailing topic text
        idx = query_lower.find(found_prep)
        topic = query[idx + len(found_prep):].strip()
        
        # Clean up leading determiners/particles
        topic = re.sub(r'^(the|my|our|a|an)\s+', '', topic, flags=re.IGNORECASE)
        
        # Map equivalent semantic prepositions
        if found_prep == "what led me to":
            found_prep = "before"
        elif found_prep == "helped me solve":
            found_prep = "during"
        elif found_prep == "connected to":
            found_prep = "during"
            
        return found_prep, topic

    def _get_time_string(self, timestamp: int) -> str:
        now = int(time.time() * 1000)
        diff_ms = now - timestamp
        if diff_ms < 0:
            return "just now"
        diff_sec = diff_ms // 1000
        if diff_sec < 60:
            return "just now"
        diff_min = diff_sec // 60
        if diff_min < 60:
            return f"{diff_min}m ago"
        diff_hours = diff_min // 60
        if diff_hours < 24:
            return f"{diff_hours}h ago"
        diff_days = diff_hours // 24
        if diff_days == 1:
            return "yesterday"
        return f"{diff_days} days ago"

    def _reconstruct_discovery_trail(self, workflow_id: str) -> List[Dict[str, Any]]:
        """
        Reconstructs the chronological cognitive trail of workflows and artifacts leading to/during a workflow.
        """
        artifacts = self.graph_store.get_workflow_artifacts(workflow_id)
        # Sort chronologically
        artifacts.sort(key=lambda x: x.get("timestamp", 0))
        
        trail = []
        for art in artifacts:
            trail.append({
                "type": art["type"],
                "title": art["title"],
                "value": art["value"],
                "timeString": self._get_time_string(art["timestamp"]),
                "summary": art["summary"]
            })
            
        return trail

    def search(self, query: str, limit: int = 5):
        prep, topic = self._parse_temporal_query(query)
        
        if prep and topic:
            print(f"[MemoryEngine] Temporal query identified: {prep} '{topic}'")
            return self._search_temporal(query, prep, topic, limit)
        
        # Standard Associative Search
        print(f"[MemoryEngine] Executing standard associative semantic search for: '{query}'")
        query_embedding = self.model.encode(query).tolist()
        
        # 1. Search workflows
        wf_results = self.vector_store.search(query_embedding, limit)
        
        # 2. Search artifacts
        art_results = self.vector_store.search_artifacts(query_embedding, limit)
        
        formatted_results = []
        seen_sessions = set()
        now = int(time.time() * 1000)

        # 1. Process Artifact Results First (because they represent Exact Matches)
        if art_results and art_results['ids'] and len(art_results['ids']) > 0:
            for i in range(len(art_results['ids'][0])):
                art_meta = art_results['metadatas'][0][i]
                distance = art_results['distances'][0][i]
                w_id = art_meta.get("workflow_id")
                art_type = art_meta.get("type")
                
                # We only want tangible items to be instantly openable "Photographic Memory" matches
                if art_type not in ["file", "browser_page"]:
                    continue
                
                if w_id and w_id not in seen_sessions:
                    similarity = 1.0 / (1.0 + distance)
                    final_score = (similarity * 0.8) + 0.2 
                    
                    wf_data = self.graph_store.get_workflow(w_id)
                    if wf_data:
                        artifacts = self.graph_store.get_workflow_artifacts(w_id)
                        research = [{"title": a["title"], "url": a["value"], "summary": a["summary"]} for a in artifacts if a["type"] == "browser_page"]
                        files = [{"title": a["title"], "path": a["value"], "summary": a["summary"]} for a in artifacts if a["type"] == "file"]
                        conversations = [{"title": a["title"], "summary": a["summary"]} for a in artifacts if a["type"] == "conversation"]
                        discoveries = [{"title": a["title"], "summary": a["summary"]} for a in artifacts if a["type"] == "discovery"]
                        
                        trail = self._reconstruct_discovery_trail(w_id)
                        
                        formatted_results.append({
                            "sessionId": w_id,
                            "metadata": {
                                "name": wf_data.get("name", "Unknown Session"),
                                "summary": wf_data.get("context_summary", ""),
                                "objective": wf_data.get("probable_objective", ""),
                                "startTime": wf_data.get("start_time", 0),
                                "duration": wf_data.get("duration", 0),
                                "apps": wf_data.get("status", "")
                            },
                            "score": final_score,
                            "isCognitive": True,
                            "explanation": f"Found exact match: '{art_meta.get('title')}'",
                            "exactMatch": {
                                "type": art_meta.get("type"),
                                "title": art_meta.get("title"),
                                "value": art_meta.get("value")
                            },
                            "discoveryTrail": trail,
                            "relatedResearch": research,
                            "connectedFiles": files,
                            "relatedConversations": conversations,
                            "connectedDiscoveries": discoveries
                        })
                        seen_sessions.add(w_id)

        # 2. Process Workflow Results
        if wf_results and wf_results['ids'] and len(wf_results['ids']) > 0:
            for i in range(len(wf_results['ids'][0])):
                session_id = wf_results['ids'][0][i]
                if session_id in seen_sessions:
                    continue
                    
                metadata = wf_results['metadatas'][0][i]
                distance = wf_results['distances'][0][i]
                
                similarity = 1.0 / (1.0 + distance)
                
                start_time = metadata.get("startTime", 0)
                hours_since = (now - start_time) / (1000 * 60 * 60)
                recency_score = max(0, 1 - (hours_since / 168))
                
                duration = metadata.get("duration", 0)
                duration_score = min(duration / (1000 * 60 * 60), 1.0)
                
                final_score = (similarity * 0.7) + (recency_score * 0.15) + (duration_score * 0.15)
                
                artifacts = self.graph_store.get_workflow_artifacts(session_id)
                research = [{"title": a["title"], "url": a["value"], "summary": a["summary"]} for a in artifacts if a["type"] == "browser_page"]
                files = [{"title": a["title"], "path": a["value"], "summary": a["summary"]} for a in artifacts if a["type"] == "file"]
                conversations = [{"title": a["title"], "summary": a["summary"]} for a in artifacts if a["type"] == "conversation"]
                discoveries = [{"title": a["title"], "summary": a["summary"]} for a in artifacts if a["type"] == "discovery"]
                
                trail = self._reconstruct_discovery_trail(session_id)
                
                explanation = f"These resources were used during your work on: {metadata.get('name')}."
                if discoveries:
                    explanation = f"Achieved major milestone: '{discoveries[0]['title']}' after exploring these resources."
                
                formatted_results.append({
                    "sessionId": session_id,
                    "metadata": metadata,
                    "score": final_score,
                    "isCognitive": True,
                    "explanation": explanation,
                    "discoveryTrail": trail,
                    "relatedResearch": research,
                    "connectedFiles": files,
                    "relatedConversations": conversations,
                    "connectedDiscoveries": discoveries
                })
                seen_sessions.add(session_id)
                        
        formatted_results.sort(key=lambda x: x['score'], reverse=True)
        if formatted_results:
            ai_text = self.synthesizer.synthesize(query, formatted_results)
            if ai_text:
                print(f"[MemoryEngine] Synthesized AI Explanation for search: '{ai_text}'")
                formatted_results[0]["explanation"] = ai_text
        return formatted_results

    def _search_temporal(self, query: str, preposition: str, topic: str, limit: int = 5):
        """
        Executes a temporal search by anchoring on a semantically-matched workflow and filtering chronologically.
        """
        import numpy as np
        
        anchor_id = None
        anchor_name = None
        anchor_start = 0
        anchor_end = 0
        
        # 1. Attempt to match the current in-progress active session
        try:
            from app.routes.session_routes import session_manager
            active_session = session_manager.get_current_session()
            if active_session:
                active_text = f"""
                Title: {active_session.get('name', '')}
                Objective: {active_session.get('probableObjective', '')}
                Summary: {active_session.get('contextSummary', '')}
                Resources: {' '.join(active_session.get('windowTitles', []))}
                """.strip()
                active_emb = self.model.encode(active_text)
                topic_emb = self.model.encode(topic)
                
                sim = np.dot(topic_emb, active_emb) / (np.linalg.norm(topic_emb) * np.linalg.norm(active_emb))
                # Semantic similarity threshold (similarity > 0.3 indicates an active semantic context match)
                if sim > 0.30:
                    anchor_id = active_session.get('id')
                    anchor_name = active_session.get('name')
                    anchor_start = active_session.get('startTime', 0)
                    anchor_end = active_session.get('endTime', int(time.time() * 1000))
                    print(f"[MemoryEngine] Anchored on ACTIVE in-progress session: '{anchor_name}' (similarity: {sim:.4f})")
        except Exception as e:
            print(f"[MemoryEngine] Active session anchor check failed: {e}")
            
        # 2. Fall back to semantic database search if the query is not talking about the current active session
        if not anchor_id:
            topic_embedding = self.model.encode(topic).tolist()
            wf_results = self.vector_store.search(topic_embedding, limit=1)
            
            if not wf_results or not wf_results['ids'] or len(wf_results['ids'][0]) == 0:
                # Fallback to general search if anchor workflow is not found
                return self.search(query, limit)
                
            anchor_id = wf_results['ids'][0][0]
            anchor_meta = wf_results['metadatas'][0][0]
            anchor_name = anchor_meta.get("name")
            
            # Check semantic confidence threshold (Chroma L2 distance > 1.15 indicates a very weak/irrelevant match)
            distance = wf_results['distances'][0][0] if 'distances' in wf_results and len(wf_results['distances'][0]) > 0 else 0.0
            if distance > 1.15:
                print(f"[MemoryEngine] Matched anchor '{anchor_name}' has low confidence (distance: {distance:.4f}). Falling back to standard search.")
                return self.search(query, limit)
                
            anchor_start = anchor_meta.get("startTime", 0)
            anchor_duration = anchor_meta.get("duration", 0)
            anchor_end = anchor_start + anchor_duration
            print(f"[MemoryEngine] Anchored on historical database workflow: '{anchor_name}' ({anchor_id})")
        
        # 2. Get temporal candidates from SQLite
        all_artifacts = self.graph_store.get_all_artifacts()
        
        filtered_artifacts = []
        explanation = ""
        
        if preposition == "before":
            filtered_artifacts = [a for a in all_artifacts if a["timestamp"] < anchor_start]
            explanation = f"These resources were accessed shortly before you started '{anchor_name}'."
        elif preposition == "after":
            filtered_artifacts = [a for a in all_artifacts if a["timestamp"] > anchor_end]
            explanation = f"These resources were opened in the sequence after completing '{anchor_name}'."
        elif preposition == "during":
            # Padded range (2 hours before/after to catch contiguous work)
            filtered_artifacts = [a for a in all_artifacts if anchor_start - 7200000 <= a["timestamp"] <= anchor_end + 7200000]
            explanation = f"These resources were utilized contextually during: '{anchor_name}'."

        if not filtered_artifacts:
            # No artifacts found in that window, fallback to standard search
            return self.search(query, limit)
            
        # 3. Embed the full query and rank candidates semantically
        query_embedding = self.model.encode(query)
        ranked_candidates = []
        
        import numpy as np
        
        for art in filtered_artifacts:
            art_text = f"Type: {art['type']} | Title: {art['title']} | Summary: {art['summary']} | Value: {art['value']}"
            art_embedding = self.model.encode(art_text)
            
            # Calculate cosine similarity
            similarity = np.dot(query_embedding, art_embedding) / (np.linalg.norm(query_embedding) * np.linalg.norm(art_embedding))
            ranked_candidates.append((art, float(similarity)))
            
        ranked_candidates.sort(key=lambda x: x[1], reverse=True)
        top_candidates = ranked_candidates[:limit]
        
        # 4. Format the final cognitive retrieval payload
        formatted_results = []
        for art, score in top_candidates:
            # Fetch workflow context for the artifact
            w_id = art["workflow_id"]
            wf_data = self.graph_store.get_workflow(w_id) if w_id else None
            wf_name = wf_data["name"] if wf_data else "Ambient Context"
            
            # Reconstruct discovery trail for this parent session
            trail = self._reconstruct_discovery_trail(w_id) if w_id else []
            
            formatted_results.append({
                "sessionId": w_id or "ambient",
                "metadata": {
                    "name": wf_name,
                    "summary": art["summary"],
                    "objective": f"Discovered during research relative to: {anchor_name}",
                            "startTime": art["timestamp"],
                    "duration": 0,
                    "apps": art["type"]
                },
                "score": score,
                "isCognitive": True,
                "explanation": explanation,
                "discoveryTrail": trail,
                "relatedResearch": [{"title": art["title"], "url": art["value"], "summary": art["summary"]}] if art["type"] == "browser_page" else [],
                "connectedFiles": [{"title": art["title"], "path": art["value"], "summary": art["summary"]}] if art["type"] == "file" else [],
                "relatedConversations": [{"title": art["title"], "summary": art["summary"]}] if art["type"] == "conversation" else [],
                "connectedDiscoveries": [{"title": art["title"], "summary": art["summary"]}] if art["type"] == "discovery" else []
            })
            
        if formatted_results:
            ai_text = self.synthesizer.synthesize(query, formatted_results)
            if ai_text:
                print(f"[MemoryEngine] Synthesized AI Explanation for temporal: '{ai_text}'")
                formatted_results[0]["explanation"] = ai_text
        return formatted_results

    def get_graph_data(self):
        try:
            return self.graph_store.get_all_data()
        except Exception as e:
            print("GRAPH DATA ERROR:", e)
            import traceback
            traceback.print_exc()
            return {"nodes": [], "edges": []}


class AICognitiveSynthesizer:
    def _load_env_keys(self) -> Dict[str, str]:
        import os
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

    def synthesize(self, query: str, results: list) -> str:
        keys = self._load_env_keys()
        groq_key = keys.get("GROQ_API_KEY")
        
        if not groq_key:
            return None

        # Build context from top matches
        history = []
        for i, res in enumerate(results[:3]):
            name = res['metadata'].get('name', 'Ambient Flow')
            exp = res.get('explanation', '')
            trail = [f"- {t['title']} ({t['type']})" for t in res.get('discoveryTrail', [])[:4]]
            history.append(f"Workflow: {name}\nContext: {exp}\nActivities:\n" + "\n".join(trail))

        context = "\n\n".join(history)
        prompt = f"""
You are IRIS, the user's external cognitive memory prosthetic.
Synthesize a natural, human-like response answering the user's question based strictly on their captured history below.
If the history does not contain the answer, acknowledge that their memory banks don't have that specific context.
Answer in one or two concise, direct sentences. Do not mention "database", "logs", "retrieval", or "IRIS".

User Query: "{query}"

Captured History:
{context}

Response:"""

        try:
            import requests
            headers = {
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.4,
                "max_tokens": 150
            }
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json=payload,
                headers=headers,
                timeout=4.0
            )
            if res.status_code == 200:
                data = res.json()
                synthesis = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if synthesis:
                    return synthesis
        except Exception as e:
            print(f"[AISynthesizer] Groq API error: {e}")
            pass

        return None
