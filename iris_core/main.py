import warnings
warnings.filterwarnings("ignore", category=UserWarning)
import sys
import os
import ctypes

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import time
import json
import random
import re
from typing import Optional
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import watcher
from meta_os import meta_engine, rule_engine
from workspace_manager import workspace_engine
from parallel_desktop_engine import parallel_engine, PREDEFINED_ENVIRONMENTS

def is_background_task(text: str) -> bool:
    """
    Detects whether a command should execute autonomously in the isolated Parallel Desktop.
    Includes explicit background modifiers as well as autonomous research, paper searching,
    comparison, scraping, and documentation synthesis queries.
    """
    if not text:
        return False
    t_lower = text.lower().strip()

    # 1. Explicit background execution keywords
    bg_phrases = [
        "in background", "in the background", "background", "in parallel",
        "parallel desktop", "parallel workspace", "while i work", "while i continue coding",
        "while i'm working", "without interrupting me", "quietly in the background",
        "in shadow desktop", "shadow desktop", "run silently in background", "virtual desktop"
    ]
    if any(p in t_lower for p in bg_phrases):
        return True

    # 2. Autonomous research, deep search, paper finding & comparison queries
    research_indicators = [
        "google scholar", "arxiv", "find papers", "list of 30", "make a list of",
        "research laptops", "research the best", "research top", "find the best",
        "compare the top", "compare laptops", "compare frameworks", "benchmark analysis",
        "scrape data", "extract data from", "download and summarize", "literature review"
    ]
    if any(r in t_lower for r in research_indicators):
        return True

    return False

def strip_background_clause(text: str) -> str:
    """Strips background modifier phrasing to isolate the clean core action objective."""
    cleaned = text
    for p in [
        "in the background", "in background", "in parallel", "parallel desktop",
        "while i continue coding", "while i work", "while i'm working",
        "without interrupting me", "quietly in the background", "in shadow desktop",
        "run silently in background", "virtual desktop"
    ]:
        cleaned = re.sub(re.escape(p), '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip(" ,.-")

if sys.platform == "win32":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        pass

app = FastAPI(title="IRIS Core Backend")

import threading
import asyncio
from fastapi.responses import StreamingResponse
import json
from audio_engine import audio_engine

mic_active = False
mic_event_queue = None
main_loop = None
log_event_queue = None

def on_speech_heard(text: str):
    if main_loop:
        asyncio.run_coroutine_threadsafe(
            get_mic_event_queue().put({"type": "heard", "text": text}),
            main_loop
        )

audio_engine.register_callback(on_speech_heard)

@app.on_event("startup")
async def startup_event():
    global main_loop, mic_event_queue
    main_loop = asyncio.get_event_loop()
    mic_event_queue = asyncio.Queue()

def get_mic_event_queue():
    global mic_event_queue
    if mic_event_queue is None:
        mic_event_queue = asyncio.Queue()
    return mic_event_queue

def get_log_event_queue():
    global log_event_queue
    if log_event_queue is None:
        log_event_queue = asyncio.Queue()
    return log_event_queue

# Set watcher callback
def on_watcher_log(msg: str):
    if main_loop:
        asyncio.run_coroutine_threadsafe(
            get_log_event_queue().put({"type": "log", "text": msg}),
            main_loop
        )

watcher.on_log_stream = on_watcher_log

@app.on_event("shutdown")
def shutdown_event():
    global mic_active, is_shutting_down
    mic_active = False
    is_shutting_down = True
    audio_engine.stop()
    print("Shutting down IRIS Core Backend. Restoring Meta-OS states...")
    meta_engine.restore_all()

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
    source_bbox: Optional[BoundingBox] = None
    target_bbox: Optional[BoundingBox] = None
    condition: str
    action_text: str
    mode: str = "when"

class NameRequest(BaseModel):
    apps: list[str]
    urls: list[str]

@app.post("/api/generate-name")
async def generate_name(req: NameRequest):
    try:
        apps_clean = [a for a in req.apps if a and not a.startswith('System')]
        urls_clean = req.urls
        prompt = f"""You are an AI Workspace Context Analyst.
Analyze these open applications and URLs from a user's recent computer session:
- Apps: {apps_clean}
- URLs/Tabs: {urls_clean}

Create a concise, professional, highly descriptive 2-5 word title that captures what the user was actually working on.
Examples:
- ['Cursor', 'VSCode'], ['https://github.com/react'] -> "React Frontend Architecture"
- ['Excel', 'Chrome'], ['https://invoice-portal.com'] -> "Financial Invoice Audit"
- ['WhatsApp', 'Slack'], [] -> "Client Communications & Sync"
- ['Chrome'], ['https://youtube.com', 'https://twitch.tv'] -> "Media & Video Research"

Return ONLY the raw title string, no quotes, no markdown."""
        resp = watcher.call_llm_with_retry('gemini-2.5-flash', [prompt], "naming")
        name = resp.text.strip().strip('"').strip("'").strip()
        if name:
            return {"name": name}
        return {"name": "Workspace Session"}
    except Exception as e:
        return {"name": "Workspace Session"}

@app.post("/api/watch-and-strike")
async def setup_watch_and_strike(req: WatchAndStrikeRequest):
    if is_background_task(req.condition):
        clean_cmd = strip_background_clause(req.condition)
        ptask = parallel_engine.start_task(clean_cmd or req.condition, mode="autonomous")
        return {"status": "success", "task_id": ptask.task_id, "parallel_desktop": True, "message": "Launched in Parallel Desktop."}

    task_id = str(uuid.uuid4())
    
    watcher.start_watcher(
        task_id=task_id,
        source_bbox=req.source_bbox.model_dump() if req.source_bbox else None,
        target_bbox=req.target_bbox.model_dump() if req.target_bbox else None,
        condition=req.condition,
        action_text=req.action_text,
        mode=req.mode
    )
    return {"status": "success", "task_id": task_id, "message": "Automation initialized."}

@app.post("/api/pocket/restore/{task_id}")
async def restore_pocket_session(task_id: str):
    import pocket_manager
    if task_id == "all":
        pocket_manager.restore_windows(None)
    else:
        pocket_manager.restore_windows(task_id)
    return {"status": "success", "message": f"Pocket session {task_id} restored."}

@app.delete("/api/watch-and-strike/{task_id}")
async def cancel_watch_and_strike(task_id: str):
    import pocket_manager
    pocket_manager.restore_windows(task_id)
    watcher.stop_watcher(task_id)
    return {"status": "success", "message": f"Task {task_id} cancelled."}

class RelayCreateRequest(BaseModel):
    name: str
    source_app: str
    target_app: str
    instruction: str

class RelayTriggerRequest(BaseModel):
    relay_id: str
    data: str

@app.get("/api/relays")
async def get_relays():
    import relay_engine
    return {"status": "success", "relays": relay_engine.get_relays_status()}

@app.post("/api/relays/create")
async def create_relay(req: RelayCreateRequest):
    import relay_engine
    rid = str(uuid.uuid4())[:8]
    relay_engine.start_relay(rid, req.name, req.source_app, req.target_app, req.instruction)
    return {"status": "success", "relay_id": rid}

@app.post("/api/relays/trigger")
async def trigger_relay(req: RelayTriggerRequest):
    import relay_engine
    success = relay_engine.trigger_relay_event(req.relay_id, req.data)
    return {"status": "success" if success else "error"}

class ChatRequest(BaseModel):
    text: str

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    def _run_chat():
        import ocr_engine
        import uia_engine
        import workflow_engine

        # Check if the chat input is an actionable OS command
        action_keywords = [
            "open", "launch", "start", "search", "find", "google", "play", "calculate",
            "summarize", "extract", "write", "type", "copy", "paste", "close", "click",
            "press", "select", "split", "tile", "zen", "dev layout"
        ]
        q_lower = req.text.lower().strip()
        has_action = any(q_lower.startswith(k) or f" {k} " in q_lower for k in action_keywords)
        greetings = ["hi", "hello", "hey", "how are you", "who are you", "what are you", "thank you", "thanks"]
        is_greeting = any(q_lower.startswith(g) or q_lower == g for g in greetings)

        # Workspace & App Arrangement Action Commands
        if any(k in q_lower for k in ["save desktop as", "capture desktop as", "save layout as", "create workspace", "delete workspace", "list workspaces", "what workspaces", "open my", "launch my", "switch to"]):
            nl_res = workspace_engine.execute_nl_command(req.text)
            if nl_res.get("status") == "success":
                return nl_res.get("message", "Workspace command executed.")

        # Check for Parallel Desktop (Background Autonomous Execution)
        if is_background_task(req.text):
            clean_cmd = strip_background_clause(req.text)
            ptask = parallel_engine.start_task(clean_cmd or req.text, mode="autonomous")
            return f"Sure! I'll handle that in my Parallel Desktop while you continue working uninterrupted. You can monitor my live progress in the Parallel Desktop tab."

        if has_action and not is_greeting:
            # Trigger workflow execution asynchronously
            task_id = str(uuid.uuid4())
            watcher.start_watcher(
                task_id=task_id,
                source_bbox=None,
                target_bbox=None,
                condition=req.text,
                action_text="",
                mode="now"
            )
            return f"Executing: '{req.text}'"

        # Tier 0A: Instant Conversational, Workspace & Greeting Fast-Path (<10ms)
        import time
        cleaned_q = q_lower.replace("iris", "").replace(",", "").strip()
        greeting_words = ["hi", "hello", "hey", "good morning", "good evening", "good afternoon", "yo", "sup", "howdy", "greetings"]
        
        # 1. Live Workspace & Desktop Status Queries
        if any(k in q_lower for k in ["how's my workspace", "how is my workspace", "how is my desktop", "hows my workspace", "workspace status", "what am i doing", "what am i working on", "hows my setup", "how is my setup", "state of my workspace"]):
            hour = time.localtime().tm_hour
            time_greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 18 else "Good evening"
            try:
                import win32gui
                import win32_engine
                win32_engine.ensure_interactive_desktop()
                from meta_os import meta_engine
                visible_hwnds = meta_engine._get_visible_windows()
                titles = []
                for h in visible_hwnds[:5]:
                    t = win32gui.GetWindowText(h).strip()
                    if t and len(t) > 2 and "iris" not in t.lower() and "program manager" not in t.lower():
                        app_part = t.split(" - ")[-1] if " - " in t else t
                        if app_part not in titles:
                            titles.append(app_part)
                
                fg_ctrl = uia_engine.get_foreground_window_control()
                fg_name = fg_ctrl.Name if fg_ctrl else (titles[0] if titles else "Desktop")
                
                if titles:
                    apps_str = ", ".join(titles[:3])
                    return f"Your workspace is running smoothly, Anushree! {time_greeting}. You have {apps_str} active with {fg_name} in focus. What would you like to arrange or automate next?"
                else:
                    return f"Your workspace is clean and uncluttered, Anushree! {time_greeting}. Ready for your next command."
            except Exception:
                return f"Your workspace is running smoothly, Anushree! {time_greeting}. What task can I assist you with today?"

        # 2. Pure Greetings
        if q_lower in ["hi iris", "hello iris", "hey iris", "hi", "hello", "hey"] or cleaned_q in greeting_words or any(q_lower.startswith(f"{g} iris") or q_lower == g for g in greeting_words):
            hour = time.localtime().tm_hour
            time_greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 18 else "Good evening"
            return f"Hello Anushree! {time_greeting}. How can I assist you with your workspace or tasks today?"

        if "how are you" in q_lower:
            return "I'm running smoothly and keeping your workspace organized! What would you like to work on?"

        if "who are you" in q_lower or "what are you" in q_lower:
            return "I am IRIS, your autonomous AI desktop companion. I can manage window layouts, automate cross-app workflows, and assist with real-time perception."

        if any(k in q_lower for k in ["thank you", "thanks", "thx"]):
            return "You're very welcome! Always here to help."

        # Tier 0B: Instant Screen Perception Fast-Path (<20ms)
        perception_triggers = [
            "can you see my screen", "can you see me", "can you read my screen", 
            "are you watching my screen", "what do you see on my screen", "what is on my screen",
            "do you see my screen", "what app is open"
        ]
        if any(k in q_lower for k in perception_triggers):
            try:
                screen_text = ocr_engine.extract_screen_text(hwnd=0)
                fg_ctrl = uia_engine.get_foreground_window_control()
                app_name = fg_ctrl.Name if fg_ctrl else "your active window"
                snippets = [line.strip() for line in screen_text.split("\n") if len(line.strip()) > 3][:3]
                snippet_summary = f"including '{snippets[0]}'" if snippets else "your workspace"
                return f"Yes, I can see your screen clearly! You are currently working in {app_name}, {snippet_summary}."
            except Exception:
                pass

        # Tier 1: Zero-Vision Quota OCR + UIA Context Grounding (<100ms)
        try:
            screen_text = ocr_engine.extract_screen_text(hwnd=0)
            fg_ctrl = uia_engine.get_foreground_window_control()
            active_app_name = fg_ctrl.Name if fg_ctrl else "Active Desktop"
            
            prompt = f"""You are IRIS, an intelligent autonomous AI operating system companion.
User's Question: "{req.text}"
Active Application Window: "{active_app_name}"
Visible Screen Content (Extracted via Native OCR):
\"\"\"
{screen_text[:4500] if screen_text else "No active OCR text"}
\"\"\"

Answer the user's question concisely, helpfully, and accurately. Do not use asterisks or markdown, just plain conversational spoken text."""
            resp_obj = watcher.call_llm_with_retry('llama-3.3-70b-versatile', [prompt], "chat")
            if resp_obj and resp_obj.text:
                return resp_obj.text.strip().replace("*", "")
        except Exception as oe:
            print(f"[Chat] Native context note: {oe}")

        return "I am here to help. What task would you like me to execute on your computer?"
            
    try:
        ans = await asyncio.to_thread(_run_chat)
        return {"response": ans}
    except Exception as e:
        return {"response": f"System error: {str(e)}"}

@app.post("/api/mic/start")
async def start_mic():
    global mic_active
    success = await asyncio.to_thread(audio_engine.start)
    mic_active = audio_engine.is_running
    return {"status": "started" if success else "error"}

@app.post("/api/mic/stop")
async def stop_mic():
    global mic_active
    await asyncio.to_thread(audio_engine.stop)
    mic_active = False
    return {"status": "stopped"}

@app.get("/api/mic/status")
async def get_mic_status():
    return await asyncio.to_thread(audio_engine.get_status)

is_shutting_down = False

async def event_generator(request: Request):
    q = get_mic_event_queue()
    yield f"data: {json.dumps({'type': 'status', 'text': 'connected'})}\n\n"
    while not is_shutting_down:
        if await request.is_disconnected():
            break
        try:
            event = await asyncio.wait_for(q.get(), timeout=2.0)
            yield f"data: {json.dumps(event)}\n\n"
        except asyncio.TimeoutError:
            yield ": keepalive\n\n"

@app.get("/api/mic/events")
async def mic_events(request: Request):
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

async def log_event_generator(request: Request):
    q = get_log_event_queue()
    while not is_shutting_down:
        if await request.is_disconnected():
            break
        try:
            event = await asyncio.wait_for(q.get(), timeout=1.0)
            yield f"data: {json.dumps(event)}\n\n"
        except asyncio.TimeoutError:
            continue

@app.get("/api/logs/stream")
async def log_stream(request: Request):
    return StreamingResponse(log_event_generator(request), media_type="text/event-stream")

async def sandbox_feed_generator(room_name: str, request: Request):
    import sandbox
    import io
    import asyncio
    while True:
        if await request.is_disconnected():
            break
        img = await asyncio.to_thread(sandbox.take_sandbox_screenshot, room_name)
        if img:
            buf = io.BytesIO()
            img.thumbnail((1280, 720)) # Resize for feed speed
            img.save(buf, format='JPEG', quality=60)
            frame = buf.getvalue()
            header = f"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {len(frame)}\r\n\r\n".encode('utf-8')
            yield header + frame + b'\r\n'
        await asyncio.sleep(0.1) # 10 FPS

@app.get("/api/sandbox/feed/{room_name}")
async def get_sandbox_feed(room_name: str, request: Request):
    return StreamingResponse(sandbox_feed_generator(room_name, request), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/api/sandbox/frame/{room_name}")
async def get_sandbox_frame(room_name: str):
    import sandbox
    import io
    import asyncio
    from fastapi.responses import Response
    
    img = await asyncio.to_thread(sandbox.take_sandbox_screenshot, room_name)
    if img:
        buf = io.BytesIO()
        img.thumbnail((1280, 720))
        img.save(buf, format='JPEG', quality=60)
        return Response(content=buf.getvalue(), media_type="image/jpeg")
    return Response(content=b"", status_code=204)

@app.get("/api/screen/frame")
async def get_screen_frame():
    import pyautogui
    import io
    import asyncio
    from fastapi.responses import Response
    
    def grab():
        try:
            return pyautogui.screenshot()
        except:
            return None
            
    img = await asyncio.to_thread(grab)
    if img:
        buf = io.BytesIO()
        img.thumbnail((960, 540))
        img.save(buf, format='JPEG', quality=70)
        return Response(content=buf.getvalue(), media_type="image/jpeg")
    return Response(content=b"", status_code=204)

@app.get("/api/status/{task_id}")
async def get_task_status(task_id: str):
    is_active = watcher.active_watchers.get(task_id, {}).get("active", False)
    return {"status": "success", "task_id": task_id, "active": is_active}

@app.get("/api/pipelines")
async def get_pipelines():
    pipelines = []
    now = time.time()
    for tid, info in watcher.active_watchers.items():
        is_active = info.get("active", False)
        completed_at = info.get("completed_at", 0)
        # Keep active tasks OR recently finished tasks (within 6 seconds)
        if is_active or (now - completed_at < 6.0):
            pipelines.append({
                "task_id": tid,
                "mode": info.get("mode"),
                "condition": info.get("condition"),
                "action": info.get("action"),
                "status": info.get("status"),
                "thought": info.get("thought"),
                "current_action": info.get("current_action")
            })
    return {"status": "success", "pipelines": pipelines}

@app.get("/api/health")
async def health_check():
    return {"status": "online", "active_watchers": sum(1 for v in watcher.active_watchers.values() if v)}

class IntentRequest(BaseModel):
    command: str

@app.post("/api/parse-intent")
async def parse_intent_route(req: IntentRequest):
    # Instant rule-based parsing (<1ms) to eliminate LLM latency & quota usage
    cmd = req.command.lower()
    if is_background_task(cmd):
        return {"status": "success", "mode": "parallel_desktop", "trigger": "now"}
    elif any(k in cmd for k in ["pocket", "sandbox", "hide"]):
        return {"status": "success", "mode": "sandbox", "trigger": "now"}
    elif any(k in cmd for k in ["always", "whenever", "monitor"]):
        return {"status": "success", "mode": "now", "trigger": "always"}
    elif any(k in cmd for k in ["when", "if"]):
        return {"status": "success", "mode": "now", "trigger": "when"}
    else:
        return {"status": "success", "mode": "now", "trigger": "now"}

class MetaOSRequest(BaseModel):
    command: str

@app.post("/api/meta-os")
async def execute_meta_os_command(req: MetaOSRequest):
    cmd_lower = req.command.lower()
    if any(k in cmd_lower for k in ["workspace", "workspaces", "arrangement", "setup", "layout", "coding", "college", "research", "gaming", "capture desktop", "save desktop", "automatically", "startup"]):
        nl_res = workspace_engine.execute_nl_command(req.command)
        if nl_res.get("status") == "success":
            return nl_res
    result = meta_engine.smart_arrange_workspace(req.command)
    return result

# --- WORKSPACE & APP ARRANGEMENT MANAGER REST API ---

@app.get("/api/workspaces")
async def get_workspaces_route():
    """Returns all saved workspaces with application configurations."""
    return {"status": "success", "workspaces": workspace_engine.list_workspaces()}

@app.get("/api/workspaces/available-apps")
async def get_available_apps_route():
    """Discovers running desktop windows and installed applications."""
    return {"status": "success", "data": workspace_engine.get_available_applications()}

@app.get("/api/workspaces/current-layout")
async def capture_current_layout_route(name: str = "Captured Desktop Layout"):
    """Captures currently open desktop windows into a workspace definition."""
    captured = workspace_engine.capture_current_layout(workspace_name=name)
    return {"status": "success", "workspace": captured}

@app.get("/api/workspaces/startup")
async def get_startup_workspace_route():
    """Gets the designated startup workspace if any."""
    ws = workspace_engine.get_startup_workspace()
    return {"status": "success", "workspace": ws}

@app.post("/api/workspaces/startup/trigger")
async def trigger_startup_workspace_route():
    """Launches the startup workspace on system boot/app launch."""
    ws = workspace_engine.get_startup_workspace()
    if ws:
        res = workspace_engine.open_workspace(ws["id"])
        return {"status": "success", "triggered": True, "result": res}
    return {"status": "success", "triggered": False, "message": "No startup workspace configured."}

@app.get("/api/workspaces/{workspace_id}")
async def get_workspace_route(workspace_id: str):
    """Gets a specific workspace by ID or name."""
    ws = workspace_engine.get_workspace(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"status": "success", "workspace": ws}

@app.post("/api/workspaces")
async def create_workspace_route(data: dict):
    """Creates a new workspace."""
    created = workspace_engine.create_workspace(data)
    return {"status": "success", "workspace": created}

@app.put("/api/workspaces/{workspace_id}")
async def update_workspace_route(workspace_id: str, data: dict):
    """Updates an existing workspace."""
    updated = workspace_engine.update_workspace(workspace_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"status": "success", "workspace": updated}

@app.delete("/api/workspaces/{workspace_id}")
async def delete_workspace_route(workspace_id: str):
    """Deletes a workspace."""
    deleted = workspace_engine.delete_workspace(workspace_id)
    return {"status": "success" if deleted else "error"}

@app.post("/api/workspaces/{workspace_id}/duplicate")
async def duplicate_workspace_route(workspace_id: str, data: dict = None):
    """Duplicates an existing workspace."""
    new_name = data.get("name") if data else None
    dup = workspace_engine.duplicate_workspace(workspace_id, new_name)
    if not dup:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"status": "success", "workspace": dup}

@app.post("/api/workspaces/{workspace_id}/open")
async def open_workspace_route(workspace_id: str):
    """Restores desktop layout according to saved workspace."""
    res = workspace_engine.open_workspace(workspace_id)
    return {"status": "success" if res.get("success") else "error", "result": res}

@app.post("/api/workspaces/{workspace_id}/startup")
async def set_startup_workspace_route(workspace_id: str, data: dict):
    """Enables or disables startup launching for workspace."""
    enabled = bool(data.get("enabled", True))
    workspace_engine.set_startup_workspace(workspace_id, enabled)
    return {"status": "success", "startupEnabled": enabled}

# --- PARALLEL DESKTOP (AUTONOMOUS COMPUTER WORKSPACE) REST API ---

class ParallelTaskCreateRequest(BaseModel):
    condition: str
    mode: Optional[str] = "autonomous"

class ParallelModeChangeRequest(BaseModel):
    mode: str

class ParallelConfirmActionRequest(BaseModel):
    approved: bool

class ParallelTakeoverActionRequest(BaseModel):
    active: bool

class ParallelInputEventRequest(BaseModel):
    action: str
    x: int
    y: int
    text: Optional[str] = ""
    key: Optional[str] = ""

class ParallelBringToDesktopRequest(BaseModel):
    type: Optional[str] = "all"

class ParallelExportRequest(BaseModel):
    format: Optional[str] = "txt" # txt, doc, docx, pdf

class ParallelEnvLaunchRequest(BaseModel):
    env_id: str

@app.get("/api/parallel-desktop/status")
async def get_parallel_desktop_status():
    """Returns real-time status, hardware metrics, active task, and open applications."""
    metrics = parallel_engine.get_desktop_metrics()
    active_task = parallel_engine.get_active_task()
    windows = parallel_engine.get_parallel_windows()
    return {
        "status": "success",
        "metrics": metrics,
        "active_task": active_task.to_dict() if active_task else None,
        "windows": windows,
        "has_active_task": bool(active_task and active_task.status in ["running", "paused", "waiting_confirmation", "user_takeover"])
    }

@app.post("/api/parallel-desktop/tasks")
async def create_parallel_task(req: ParallelTaskCreateRequest):
    """Launches an autonomous task inside the Parallel Desktop."""
    task = parallel_engine.start_task(req.condition, mode=req.mode or "autonomous")
    return {"status": "success", "task": task.to_dict()}

@app.get("/api/parallel-desktop/tasks")
async def list_parallel_tasks():
    """Lists all active and historical parallel desktop tasks."""
    tasks = [t.to_dict() for t in parallel_engine.task_history]
    return {"status": "success", "tasks": tasks}

@app.get("/api/parallel-desktop/tasks/{task_id}")
async def get_parallel_task(task_id: str):
    """Retrieves complete task state, step timeline, and artifacts."""
    task = parallel_engine.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "success", "task": task.to_dict()}

@app.post("/api/parallel-desktop/tasks/{task_id}/pause")
async def pause_parallel_task(task_id: str):
    """Freezes autonomous task execution while preserving open virtual applications."""
    success = parallel_engine.pause_task(task_id)
    return {"status": "success" if success else "error"}

@app.post("/api/parallel-desktop/tasks/{task_id}/resume")
async def resume_parallel_task(task_id: str):
    """Resumes paused parallel task execution."""
    success = parallel_engine.resume_task(task_id)
    return {"status": "success" if success else "error"}

@app.post("/api/parallel-desktop/tasks/{task_id}/stop")
async def stop_parallel_task(task_id: str):
    """Terminates task execution."""
    success = parallel_engine.stop_task(task_id)
    return {"status": "success" if success else "error"}

@app.post("/api/parallel-desktop/tasks/{task_id}/mode")
async def set_parallel_task_mode(task_id: str, req: ParallelModeChangeRequest):
    """Switches execution mode (observe, assist, autonomous)."""
    success = parallel_engine.set_mode(task_id, req.mode)
    return {"status": "success" if success else "error"}

@app.post("/api/parallel-desktop/tasks/{task_id}/confirm")
async def confirm_parallel_task_action(task_id: str, req: ParallelConfirmActionRequest):
    """Resolves pending user confirmation in Assist mode."""
    success = parallel_engine.confirm_action(task_id, req.approved)
    return {"status": "success" if success else "error"}

@app.post("/api/parallel-desktop/tasks/{task_id}/takeover")
async def set_parallel_task_takeover(task_id: str, req: ParallelTakeoverActionRequest):
    """Enables or disables interactive user Take Over mode."""
    success = parallel_engine.set_takeover(task_id, req.active)
    return {"status": "success" if success else "error", "takeover_active": req.active}

@app.post("/api/parallel-desktop/input")
async def inject_parallel_desktop_input(req: ParallelInputEventRequest):
    """Forwards interactive clicks and typing from preview canvas to virtual window."""
    success = parallel_engine.inject_input(
        action_type=req.action,
        x=req.x,
        y=req.y,
        text=req.text or "",
        key=req.key or ""
    )
    return {"status": "success" if success else "error"}

@app.post("/api/parallel-desktop/tasks/{task_id}/bring-to-desktop")
async def bring_parallel_results_to_desktop(task_id: str, req: ParallelBringToDesktopRequest = None):
    """Transfers task artifacts (files, URLs, reports) to user's real host desktop."""
    transfer_type = req.type if req else "all"
    res = parallel_engine.bring_to_desktop(task_id, transfer_type=transfer_type)
    return res

@app.post("/api/parallel-desktop/tasks/{task_id}/export")
async def export_parallel_task_dossier(task_id: str, req: ParallelExportRequest = None):
    """Exports dossier directly to Desktop as .txt, .docx/.doc, or .pdf."""
    fmt = req.format if req and req.format else "txt"
    res = parallel_engine.export_dossier(task_id, format_type=fmt)
    return res

async def parallel_desktop_feed_generator(request: Request):
    from fastapi.responses import StreamingResponse
    while True:
        if await request.is_disconnected():
            break
        frame = await asyncio.to_thread(parallel_engine.get_frame_bytes)
        header = f"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {len(frame)}\r\n\r\n".encode('utf-8')
        yield header + frame + b'\r\n'
        await asyncio.sleep(0.08) # ~12 FPS

@app.get("/api/parallel-desktop/feed")
@app.get("/api/parallel-desktop/feed/{task_id}")
async def get_parallel_desktop_feed(request: Request, task_id: str = None):
    """High-speed MJPEG video feed of the Parallel Desktop."""
    return StreamingResponse(
        parallel_desktop_feed_generator(request),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/api/parallel-desktop/frame")
@app.get("/api/parallel-desktop/frame/{task_id}")
async def get_parallel_desktop_frame(task_id: str = None):
    """High-resolution single snapshot frame of the Parallel Desktop."""
    from fastapi.responses import Response
    frame_bytes = await asyncio.to_thread(parallel_engine.get_frame_bytes)
    return Response(content=frame_bytes, media_type="image/jpeg")

@app.get("/api/parallel-desktop/environments")
async def get_parallel_environments():
    """Lists pre-configured persistent environments (Research, Dev, Work, etc.)."""
    envs = [
        {
            "env_id": e.env_id,
            "name": e.name,
            "description": e.description,
            "apps": e.apps,
            "icon": e.icon
        }
        for e in PREDEFINED_ENVIRONMENTS
    ]
    return {"status": "success", "environments": envs}

@app.post("/api/parallel-desktop/environments/launch")
async def launch_parallel_environment(req: ParallelEnvLaunchRequest):
    """Spawns all applications for a persistent environment in the Parallel Desktop."""
    matched = next((e for e in PREDEFINED_ENVIRONMENTS if e.env_id == req.env_id), None)
    if not matched:
        raise HTTPException(status_code=404, detail="Environment not found")
    
    for app in matched.apps:
        parallel_engine.launch_process_in_desktop(app)
        
    return {"status": "success", "message": f"Environment '{matched.name}' launched in Parallel Desktop."}

@app.post("/api/workspaces/{workspace_id}/open-parallel")
async def open_workspace_parallel_route(workspace_id: str):
    """Launches a saved workspace configuration specifically in the Parallel Desktop."""
    ws = workspace_engine.get_workspace(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    apps = ws.get("applications", [])
    for a in apps:
        app_name = a.get("appIdentifier") or a.get("name", "chrome")
        parallel_engine.launch_process_in_desktop(app_name)
        
    return {
        "status": "success",
        "message": f"Workspace '{ws.get('name')}' opened inside Parallel Desktop.",
        "workspace": ws
    }


class RuleRequest(BaseModel):
    trigger_type: str
    trigger_operator: str
    trigger_value: str
    action: str

# --- CONTINUOUS COGNITIVE PROFILE ENGINE (Episodic Habit Learning) ---
MEMORY_FILE = os.path.join(os.path.dirname(__file__), "user_memory.json")

def load_user_memory():
    if os.path.exists(MEMORY_FILE):
        try:
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "user_name": "Anushree",
        "total_sessions": 14,
        "frequent_apps": ["VS Code", "Google Chrome", "File Explorer", "Excel"],
        "top_projects": ["IRIS Autonomous OS", "React Frontend", "Invoice Automation"],
        "peak_focus_hours": "Late Evening (8 PM - 1 AM)",
        "days_active": 4,
        "habits": [
            "Codes frontend in React & Vite with TypeScript",
            "Frequently audits invoices and spreadsheets",
            "Prefers deep focus with tiled development windows"
        ]
    }

def save_user_memory(mem):
    try:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(mem, f, indent=2)
    except Exception:
        pass

# --- SQLITE TIMELINE PERSISTENCE (Zero Data Loss on Restart) ---
import sqlite3

DB_FILE = os.path.join(os.path.dirname(__file__), "iris_timeline.sqlite")

def init_timeline_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS timeline_sessions (
            id TEXT PRIMARY KEY,
            name TEXT,
            startTime INTEGER,
            duration INTEGER,
            dominantApps TEXT,
            windowTitles TEXT,
            urls TEXT,
            files TEXT,
            contextSummary TEXT,
            probableObjective TEXT,
            updatedAt INTEGER
        )
    ''')
    conn.commit()
    conn.close()

init_timeline_db()

def consolidate_timeline_sessions(raw_sessions: list) -> list:
    """Consolidates adjacent micro-sessions with the same topic/apps and removes 0m orphan noise."""
    if not raw_sessions:
        return []

    # Sort chronologically (oldest to newest)
    sorted_sess = sorted(raw_sessions, key=lambda s: s.get("startTime", 0))
    consolidated = []

    for s in sorted_sess:
        name = s.get("name", "Workspace Session")
        duration = s.get("duration", 0)
        start_time = s.get("startTime", int(time.time() * 1000))
        apps = s.get("dominantApps", [])
        urls = s.get("urls", [])
        files = s.get("files", [])
        titles = s.get("windowTitles", [])

        if not consolidated:
            consolidated.append({
                "id": s.get("id"),
                "name": name,
                "startTime": start_time,
                "duration": duration,
                "dominantApps": apps,
                "windowTitles": titles,
                "urls": urls,
                "files": files,
                "contextSummary": s.get("contextSummary", ""),
                "probableObjective": s.get("probableObjective", name)
            })
            continue

        prev = consolidated[-1]
        prev_end = prev["startTime"] + prev["duration"]
        gap = start_time - prev_end
        
        # Merge criteria: Same name OR overlapping dominant app, and started within 10 minutes of previous session
        is_same_context = (name == prev["name"]) or (
            any(a in prev["dominantApps"] for a in apps if a and a.lower() not in ['explorer', 'snippingtool'])
            and ("Focused Workflow" in name and "Focused Workflow" in prev["name"])
        )
        is_within_gap = gap < 10 * 60 * 1000 # 10 minutes

        if is_same_context and is_within_gap:
            # Merge into prev session
            new_end = max(prev_end, start_time + duration)
            prev["duration"] = max(prev["duration"], new_end - prev["startTime"])
            prev["dominantApps"] = list(dict.fromkeys(prev["dominantApps"] + apps))
            prev["windowTitles"] = list(dict.fromkeys(prev["windowTitles"] + titles))
            prev["urls"] = list(dict.fromkeys(prev["urls"] + urls))
            prev["files"] = list(dict.fromkeys(prev["files"] + files))
            prev["contextSummary"] = f"Captured {len(prev['dominantApps'])} apps, {len(prev['files'])} files, and {len(prev['urls'])} URLs"
            if name != "Workspace Session" and prev["name"] == "Workspace Session":
                prev["name"] = name
                prev["probableObjective"] = name
        else:
            # Only append if it's not a 0-second empty ghost session
            if duration >= 30000 or len(urls) > 0 or len(files) > 0 or len(apps) > 1:
                consolidated.append({
                    "id": s.get("id"),
                    "name": name,
                    "startTime": start_time,
                    "duration": duration,
                    "dominantApps": apps,
                    "windowTitles": titles,
                    "urls": urls,
                    "files": files,
                    "contextSummary": s.get("contextSummary", ""),
                    "probableObjective": s.get("probableObjective", name)
                })

    # Return newest first
    consolidated.sort(key=lambda s: s.get("startTime", 0), reverse=True)
    return consolidated

@app.get("/api/timeline/sessions")
async def get_saved_sessions():
    """Fetches all persistent timeline sessions from SQLite database, deduplicated and consolidated."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT * FROM timeline_sessions ORDER BY startTime DESC')
    rows = c.fetchall()
    conn.close()
    
    raw_sessions = []
    for r in rows:
        raw_sessions.append({
            "id": r[0],
            "name": r[1],
            "startTime": r[2],
            "duration": r[3],
            "dominantApps": json.loads(r[4]) if r[4] else [],
            "windowTitles": json.loads(r[5]) if r[5] else [],
            "urls": json.loads(r[6]) if r[6] else [],
            "files": json.loads(r[7]) if r[7] else [],
            "contextSummary": r[8],
            "probableObjective": r[9]
        })
    
    clean_sessions = consolidate_timeline_sessions(raw_sessions)
    return {"status": "success", "sessions": clean_sessions}

@app.post("/api/companion/learn")
async def learn_from_timeline(req: dict):
    """Ingests live timeline sessions, consolidates them, saves them to SQLite, and updates habits profile."""
    try:
        sessions = req.get("sessions", [])
        if not sessions:
            return {"status": "noop"}
            
        clean_sessions = consolidate_timeline_sessions(sessions)

        # 1. Save consolidated sessions into SQLite
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        for s in clean_sessions:
            if not s.get("id"): continue
            c.execute('''
                INSERT OR REPLACE INTO timeline_sessions 
                (id, name, startTime, duration, dominantApps, windowTitles, urls, files, contextSummary, probableObjective, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                s.get("id"),
                s.get("name", "Workspace Session"),
                s.get("startTime", int(time.time() * 1000)),
                s.get("duration", 0),
                json.dumps(s.get("dominantApps", [])),
                json.dumps(s.get("windowTitles", [])),
                json.dumps(s.get("urls", [])),
                json.dumps(s.get("files", [])),
                s.get("contextSummary", ""),
                s.get("probableObjective", ""),
                int(time.time() * 1000)
            ))
        conn.commit()
        conn.close()
            
        # 2. Learn habits profile
        mem = load_user_memory()
        mem["total_sessions"] = max(mem.get("total_sessions", 0), len(clean_sessions))
        
        all_apps = []
        all_topics = []
        for s in clean_sessions:
            if s.get("dominantApps"):
                all_apps.extend(s["dominantApps"])
            if s.get("name") and "Simulator" not in s["name"]:
                all_topics.append(s["name"])
                
        if all_apps:
            from collections import Counter
            counts = Counter(all_apps)
            top_apps = [app for app, _ in counts.most_common(4)]
            mem["frequent_apps"] = top_apps
            
        if all_topics:
            mem["top_projects"] = list(dict.fromkeys(all_topics))[:3]
            
        save_user_memory(mem)
        return {"status": "success", "learned": mem}
    except Exception as e:
        return {"status": "error", "message": str(e)}

last_remark_idx = -1

@app.get("/api/companion/remarks")
async def get_companion_remark():
    """Generates an intelligent, hyper-personalized remark based on learned episodic habits."""
    global last_remark_idx
    mem = load_user_memory()
    current_hour = time.localtime().tm_hour
    time_of_day = "night" if current_hour >= 21 or current_hour < 5 else "evening" if current_hour >= 17 else "afternoon" if current_hour >= 12 else "morning"
    
    apps = mem.get("frequent_apps", ["VS Code", "Chrome", "Excel"])
    top_app = apps[0] if len(apps) > 0 else "VS Code"
    second_app = apps[1] if len(apps) > 1 else "Chrome"
    third_app = apps[2] if len(apps) > 2 else "Excel"
    top_proj = mem.get("top_projects", ["IRIS Development"])[0]
    total_sess = mem.get("total_sessions", 14)
    
    session_desc = "Early morning" if current_hour < 9 else "Productive morning" if current_hour < 12 else "Afternoon" if current_hour < 17 else "Evening" if current_hour < 21 else "Late night"

    contextual_remarks = [
        f"🌸 Day {mem.get('days_active', 4)} together! You've been coding intensely in {top_app}. Don't forget to hydrate!",
        f"☕ {session_desc} coding session on {top_proj}. I'm quietly keeping things fast in the background.",
        f"🌿 I've memorized your {third_app} & invoice patterns. Just say 'Iris' if you want automatic extraction!",
        f"💻 Workspace running smoothly — indexing your {top_app} & {second_app} workflow in real time.",
        f"🎯 {total_sess} cognitive workflows indexed in your timeline. You're building something incredible!",
        f"⚡ 0ms OS hooks active. If you want a split screen between {top_app} and {second_app}, just ask me!",
        f"🛡️ Isolated sandbox chamber is on standby whenever you need to inspect untrusted files safely.",
        f"✨ Noticed your focus rhythm this {time_of_day}. Take a quick stretch if your eyes feel tired!"
    ]
    
    # Ensure it never picks the same remark consecutively
    available_indices = [i for i in range(len(contextual_remarks)) if i != last_remark_idx]
    chosen_idx = random.choice(available_indices)
    last_remark_idx = chosen_idx
    
    return {
        "status": "success",
        "remark": contextual_remarks[chosen_idx],
        "memory_summary": mem
    }

@app.get("/api/meta-os/rules")
async def get_rules():
    return {"status": "success", "rules": rule_engine.rules}

@app.post("/api/meta-os/rules")
async def add_rule(req: RuleRequest):
    rule = {
        "trigger": {
            "type": req.trigger_type,
            "operator": req.trigger_operator,
            "value": req.trigger_value
        },
        "action": req.action
    }
    added_rule = rule_engine.add_rule(rule)
    return {"status": "success", "rule": added_rule}

@app.delete("/api/meta-os/rules/{rule_id}")
async def remove_rule(rule_id: int):
    rule_engine.remove_rule(rule_id)
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
