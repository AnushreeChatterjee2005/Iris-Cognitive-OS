from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any
from app.workflow_engine.inference import InferenceEngine

router = APIRouter()
inference_engine = InferenceEngine()

class InferenceRequest(BaseModel):
    events: List[Dict[str, Any]]

@router.post("/infer")
def infer_workflow(request: InferenceRequest):
    return {
        "name": inference_engine.infer_workflow_name(request.events),
        "summary": inference_engine.generate_summary(request.events),
        "objective": inference_engine.infer_probable_objective(request.events)
    }
