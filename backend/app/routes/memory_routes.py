from fastapi import APIRouter
from app.models.schemas import WorkflowSession, MemoryQuery
from app.memory_engine.memory import MemoryEngine

router = APIRouter()
memory_engine = MemoryEngine()

@router.post("/embed")
def embed_session(session: WorkflowSession):
    return memory_engine.embed_session(session)

@router.post("/search")
def search_memory(query: MemoryQuery):
    return memory_engine.search(query.query, query.limit)
@router.get("/graph")
def get_graph():
    return memory_engine.get_graph_data()
