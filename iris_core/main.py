from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import watcher
import ctypes
import sys

if sys.platform == "win32":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        pass

app = FastAPI(title="IRIS Core Backend")

# Allow Electron UI to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BoundingBox(BaseModel):
    x: int
    y: int
    w: int
    h: int

class Coordinates(BaseModel):
    x: int
    y: int

class WatchAndStrikeRequest(BaseModel):
    source_bbox: BoundingBox
    target_bbox: BoundingBox
    condition: str
    action_text: str
    mode: str = "when"

@app.post("/api/watch-and-strike")
async def setup_watch_and_strike(req: WatchAndStrikeRequest):
    import asyncio
    task_id = str(uuid.uuid4())
    
    if req.mode == "now":
        watcher.active_watchers[task_id] = True
        await asyncio.to_thread(
            watcher.watch_loop_full,
            task_id,
            req.source_bbox.model_dump(),
            req.target_bbox.model_dump(),
            req.condition,
            req.action_text,
            req.mode
        )
        return {"status": "success", "task_id": task_id, "message": "Extraction complete."}
    else:
        watcher.start_watcher(
            task_id=task_id,
            source_bbox=req.source_bbox.model_dump(),
            target_bbox=req.target_bbox.model_dump(),
            condition=req.condition,
            action_text=req.action_text,
            mode=req.mode
        )
        return {"status": "success", "task_id": task_id, "message": "Watcher initialized."}

@app.delete("/api/watch-and-strike/{task_id}")
async def cancel_watch_and_strike(task_id: str):
    watcher.stop_watcher(task_id)
    return {"status": "success", "message": "Watcher cancelled."}

@app.get("/api/health")
async def health_check():
    return {"status": "online", "active_watchers": sum(1 for v in watcher.active_watchers.values() if v)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
