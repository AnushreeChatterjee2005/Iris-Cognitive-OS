from fastapi import APIRouter, Request
from app.sessionizer.session_manager import SessionManager
from typing import Dict, Any

router = APIRouter()
session_manager = SessionManager()

@router.post("/events")
async def process_event(request: Request):
    event = await request.json()
    session = session_manager.process_event(event)
    return {"status": "processed", "session": session}

@router.get("/active-session")
def get_active_session():
    return session_manager.get_current_session()
