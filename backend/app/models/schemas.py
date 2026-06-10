from pydantic import BaseModel
from typing import List, Optional

class WorkflowSession(BaseModel):
    id: str
    name: str
    startTime: int
    endTime: Optional[int] = None
    duration: int
    dominantApps: List[str]
    windowTitles: List[str]
    urls: List[str]
    files: List[str]
    eventCount: int
    status: str
    contextSummary: Optional[str] = None
    probableObjective: Optional[str] = None
    confidenceScore: float
    relatedSessions: List[str] = []

class MemoryQuery(BaseModel):
    query: str
    limit: int = 5
