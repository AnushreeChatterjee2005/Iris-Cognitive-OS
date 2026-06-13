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

class NameRequest(BaseModel):
    apps: list[str]
    urls: list[str]

@app.post("/api/generate-name")
async def generate_name(req: NameRequest):
    try:
        prompt = f"Invent a short, professional, 2-5 word title for a work session consisting of these apps: {req.apps} and URLs: {req.urls}. Examples: 'Frontend UI Development', 'Market Research & Outreach'. Return ONLY the raw string name without quotes."
        resp = watcher.call_llm_with_retry('llama-3.3-70b-versatile', [prompt], "naming")
        name = resp.text.strip().strip('"').strip("'")
        return {"name": name}
    except Exception as e:
        return {"name": "Local Captured Context"}

@app.post("/api/watch-and-strike")
async def setup_watch_and_strike(req: WatchAndStrikeRequest):
    import asyncio
    task_id = str(uuid.uuid4())
    
    if req.mode == "now":
        watcher.active_watchers[task_id] = {
            "active": True,
            "mode": req.mode,
            "condition": req.condition,
            "action": req.action_text,
            "status": "watching"
        }
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

@app.get("/api/status/{task_id}")
async def get_task_status(task_id: str):
    is_active = watcher.active_watchers.get(task_id, {}).get("active", False)
    return {"status": "success", "task_id": task_id, "active": is_active}

@app.get("/api/pipelines")
async def get_pipelines():
    pipelines = []
    for tid, info in watcher.active_watchers.items():
        if info.get("active", False):
            pipelines.append({
                "task_id": tid,
                "mode": info.get("mode"),
                "condition": info.get("condition"),
                "action": info.get("action"),
                "status": info.get("status")
            })
    return {"status": "success", "pipelines": pipelines}

@app.get("/api/health")
async def health_check():
    return {"status": "online", "active_watchers": sum(1 for v in watcher.active_watchers.values() if v)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
