import chromadb
import os

DB_DIR = os.path.join(os.getcwd(), ".iris_chroma_db")

class ChromaVectorStore:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=DB_DIR)
        self.collection = self.client.get_or_create_collection(name="iris_sessions")
        self.artifacts_collection = self.client.get_or_create_collection(name="iris_artifacts")

    def add_memory(self, session_id: str, embedding: list[float], metadata: dict):
        # Chroma expects strings, ints, floats, or bools in metadata
        clean_metadata = {
            "name": metadata.get("name", ""),
            "summary": metadata.get("summary", ""),
            "objective": metadata.get("objective", "") or "",
            "startTime": metadata.get("startTime", 0),
            "duration": metadata.get("duration", 0),
            "apps": ",".join(metadata.get("apps", [])),
            "confidenceScore": metadata.get("confidenceScore", 0.0)
        }
        
        self.collection.upsert(
            ids=[session_id],
            embeddings=[embedding],
            metadatas=[clean_metadata]
        )

    def add_artifact_memory(self, artifact_id: str, embedding: list[float], metadata: dict):
        clean_metadata = {
            "title": metadata.get("title", ""),
            "type": metadata.get("type", ""),
            "value": metadata.get("value", ""),
            "timestamp": metadata.get("timestamp", 0),
            "summary": metadata.get("summary", ""),
            "workflow_id": metadata.get("workflow_id", "")
        }
        
        self.artifacts_collection.upsert(
            ids=[artifact_id],
            embeddings=[embedding],
            metadatas=[clean_metadata]
        )

    def search(self, query_embedding: list[float], limit: int = 5):
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            include=["metadatas", "distances"]
        )
        return results

    def search_artifacts(self, query_embedding: list[float], limit: int = 5):
        results = self.artifacts_collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            include=["metadatas", "distances"]
        )
        return results

