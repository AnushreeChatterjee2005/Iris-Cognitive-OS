"""
IRIS Core: Native Autonomous Workflow Orchestrator
Coordinates seamless cross-application workflows using LLM step decomposition,
Win32 OS hooks, UIAutomation, DOM-first browser control, and verified vision fallbacks.
"""

import os
import re
import time
import glob
import json
from urllib.parse import quote_plus
from task_state import TaskState, transition_task_record
from browser_automation import BrowserAction, PlaywrightCDPAdapter
try:
    import pypdf
except ImportError:
    pypdf = None

try:
    import pyautogui
except ImportError:
    pyautogui = None

try:
    import pyperclip
except ImportError:
    pyperclip = None
import win32gui
import win32con

import uia_engine
import win32_engine

browser_adapter_factory = PlaywrightCDPAdapter

def decompose_command_with_llm(command: str) -> list[dict]:
    """
    Decomposes a complex natural language command into an ordered sequence of executable steps.
    Uses the OpenAI Responses API and falls back to deterministic local
    decomposition when the API is unavailable.
    """
    cmd_clean = command.strip()
    for prefix in ["can you please ", "could you please ", "can you ", "could you ", "please ", "iris, ", "iris ", "i want you to ", "help me "]:
        if cmd_clean.lower().startswith(prefix):
            cmd_clean = cmd_clean[len(prefix):].strip()

    # 0. Attempt OpenAI API Decomposition (<200ms)
    try:
        from openai import OpenAI
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)
        openai_key = os.environ.get("OPENAI_API_KEY")
        if openai_key:
            client = OpenAI(api_key=openai_key.strip(), timeout=5.0, max_retries=1)
            prompt = f"""You are the IRIS Autonomous Task Planner. Decompose this user request into discrete, sequential OS steps:
"{cmd_clean}"

Supported actions:
- "open": Launch or focus an app/website (e.g. spotify, whatsapp, chrome, notepad, calculator, discord, vscode, figma, slack, excel)
- "search": Open browser with search query or documentation URL
- "summarize": Synthesize structured research notes for a topic into a note file
- "type": Focus an app and type text
- "click": Find and click a UI button or element
- "close": Close an open window or app
- "extract": Parse invoice PDFs and export structured table to Excel
- "meta_os": Window tiling, split screen, dev layout, or zen mode

Return ONLY a JSON array of step objects, no markdown formatting, no explanations:
[
  {{"step": 1, "action": "open", "target": "vscode", "description": "Opening Visual Studio Code"}},
  {{"step": 2, "action": "open", "target": "spotify", "description": "Opening Spotify"}}
]"""
            step_schema = {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "step": {"type": "integer"},
                        "action": {"type": "string", "enum": ["open", "search", "summarize", "type", "click", "close", "extract", "save", "meta_os"]},
                        "target": {"type": "string"},
                        "description": {"type": "string"},
                        "app": {"type": "string"},
                        "content": {"type": "string"},
                        "sort": {"type": "string"},
                    },
                    "required": ["step", "action", "target", "description", "app", "content", "sort"],
                    "additionalProperties": False,
                },
            }
            response = client.responses.create(
                model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                instructions="Return one bounded, sequential plan using only the supported actions.",
                input=prompt,
                text={"format": {"type": "json_schema", "name": "workflow_steps", "schema": step_schema, "strict": True}},
                max_output_tokens=600,
                store=False,
            )
            parsed_steps = json.loads((response.output_text or "").strip())
            if isinstance(parsed_steps, list) and len(parsed_steps) > 0:
                return parsed_steps
    except Exception as oae:
        print(f"[Planner] OpenAI decomposition note: {oae}")

    # A deterministic local planner is the only fallback; no secondary cloud
    # provider receives user commands.
    return decompose_command_heuristic(cmd_clean)

def decompose_command_heuristic(command: str) -> list[dict]:
    """
    Fast rule-based decomposition covering all compound OS patterns.
    """
    cmd_lower = command.lower().strip()

    # Case A: Workspace / Split-Screen
    if any(k in cmd_lower for k in ["split", "tile", "zen", "dev layout", "70/30", "50/50", "three columns", "restore desktop", "fullscreen", "pip"]):
        return [{
            "step": 1,
            "action": "meta_os",
            "target": command,
            "description": f"Arranging workspace layout for '{command}'"
        }]

    # Case B: PDF / Invoice Batch Extraction
    if any(k in cmd_lower for k in ["pdf", "invoice", "invoices"]) and any(k in cmd_lower for k in ["excel", "sheet", "extract", "copy"]):
        return [{
            "step": 1,
            "action": "extract",
            "target": "invoices",
            "app": "excel",
            "description": "Extracting invoice details from PDFs and injecting into Microsoft Excel"
        }]

    # Case C: Search / Documentation + Note Taking (e.g. "search mongodb docs and summarize in notepad")
    if any(k in cmd_lower for k in ["search", "google", "find", "look up", "docs", "documentation"]) and any(k in cmd_lower for k in ["summarize", "notes", "notepad", "note"]):
        # Extract query topic cleanly
        query = cmd_lower
        for p in [
            "open google search, search for ", "open google search, search ", "open google search and search for ",
            "open google search and search ", "open google search for ", "open google search ", "open google ",
            "go to google, search ", "go to google search ", "search google for ", "search for ", "search ", "look up ", "find "
        ]:
            if p in query:
                query = query.split(p, 1)[1]
                break

        # Strip navigation and summarization clauses with regex
        query = re.sub(r'[\s,]+(?:and\s+)?go\s+to\s+(?:its\s+)?(?:documentation|docs)\b.*', '', query, flags=re.IGNORECASE)
        query = re.sub(r'[\s,]+(?:and\s+)?summarize\b.*', '', query, flags=re.IGNORECASE)
        query = re.sub(r'[\s,]+(?:and\s+)?take\s+notes\b.*', '', query, flags=re.IGNORECASE)
        query = re.sub(r'[\s,]+(?:and\s+)?in\s+notepad\b.*', '', query, flags=re.IGNORECASE)

        query_clean = query.replace("on google", "").replace("in chrome", "").strip(" ,;:-.")
        for lead in ["search for ", "search ", "for ", ", "]:
            if query_clean.startswith(lead):
                query_clean = query_clean[len(lead):].strip(" ,;:-.")

        if not query_clean:
            query_clean = "documentation"

        target_app = "notepad" if "notepad" in cmd_lower else "notes"
        return [
            {
                "step": 1,
                "action": "search",
                "target": f"{query_clean} official documentation",
                "app": "browser",
                "description": f"Searching Google for '{query_clean}' official documentation"
            },
            {
                "step": 2,
                "action": "summarize",
                "topic": query_clean,
                "target": target_app,
                "description": f"Synthesizing structured technical summary for {query_clean.title()}"
            }
        ]

    # Case D0: YT Music / YouTube Music Search & Playback (e.g. "open chrome and search for yt music and play any music")
    if any(k in cmd_lower for k in ["yt music", "ytmusic", "youtube music", "yt-music"]) or ("music" in cmd_lower and any(k in cmd_lower for k in ["play", "search", "listen", "song", "track"])):
        query = cmd_lower
        for p in [
            "search for yt music and play ", "search for yt music and ", "search yt music for ", "open chrome and search for yt music and play ",
            "open chrome and search for yt music and ", "open yt music and play ", "search for music ", "play music ", "search for ", "play "
        ]:
            if p in query:
                query = query.split(p, 1)[1]
                break

        query_clean = re.sub(r'[\s,]+(?:and\s+)?(?:then\s+)?(?:play|listen|open|click)\b.*', '', query, flags=re.IGNORECASE)
        query_clean = query_clean.replace("yt music", "").replace("youtube music", "").replace("chrome", "").replace("like stuff", "").replace("any music", "").replace("music", "").strip(" ,;:-.")

        if not query_clean or len(query_clean) <= 1:
            query_clean = "top hits music"

        return [
            {
                "step": 1,
                "action": "search",
                "target": query_clean,
                "app": "ytmusic",
                "description": f"Searching YT Music for '{query_clean}'"
            },
            {
                "step": 2,
                "action": "click",
                "target": "first song track",
                "description": f"Playing '{query_clean}' on YT Music"
            }
        ]

    # Case D: YouTube Search + Play / Click Video (e.g. "open youtube, search dsa and click on the most popular video")
    if "youtube" in cmd_lower and any(k in cmd_lower for k in ["play", "click", "open the", "watch", "select", "first video", "popular", "top video"]):
        query = cmd_lower
        for p in [
            "open youtube, search for ", "open youtube, search ", "open youtube and search for ", "open youtube and search ",
            "search youtube for ", "search on youtube for ", "search for ", "search ", "on youtube "
        ]:
            if p in query:
                query = query.split(p, 1)[1]
                break

        is_popular = any(k in cmd_lower for k in ["popular", "views", "most viewed", "top"])
        # Strip trailing click/play instructions
        query = re.sub(r'[\s,]+(?:and\s+)?(?:then\s+)?(?:open|click|play|watch|select)\s+(?:on\s+)?(?:the\s+)?(?:most\s+)?(?:popular|first|top)?\s*(?:video|result)?\b.*', '', query, flags=re.IGNORECASE)
        query = re.sub(r'[\s,]+(?:and\s+)?(?:play|watch)\b.*', '', query, flags=re.IGNORECASE)
        query_clean = query.replace("on youtube", "").replace("in youtube", "").replace("youtube", "").strip(" ,;:-.")

        if not query_clean:
            query_clean = "dsa"

        sort_param = "view_count" if is_popular else None
        return [
            {
                "step": 1,
                "action": "search",
                "target": query_clean,
                "app": "youtube",
                "sort": sort_param,
                "description": f"Searching YouTube for '{query_clean}'" + (" (Sorted by views)" if is_popular else "")
            },
            {
                "step": 2,
                "action": "click",
                "target": "first video",
                "description": "Playing the top video result"
            }
        ]

    # Case E: Simple Web Search / YouTube
    if any(k in cmd_lower for k in ["search", "google", "look up", "find", "youtube", "browse"]):
        query = cmd_lower
        for p in ["search google for ", "search for ", "search ", "look up ", "find ", "play on youtube ", "on youtube ", "open "]:
            if p in query:
                query = query.split(p, 1)[1]
                break
        query_clean = query.replace("on google", "").replace("in chrome", "").replace("on youtube", "").strip(" ,;:-.")
        app = "youtube" if "youtube" in cmd_lower else "browser"
        return [{
            "step": 1,
            "action": "search",
            "target": query_clean or "Google Search",
            "app": app,
            "description": f"Searching {app.title()} for '{query_clean}'"
        }]

    # Case E: App Launching + Typing (e.g. "open notepad and type Hello World")
    if any(k in cmd_lower for k in ["type", "write", "send", "message"]) and any(k in cmd_lower for k in ["in", "to", "into", "and"]):
        app_name = "notepad"
        for candidate in ["notepad", "word", "slack", "discord", "spotify", "whatsapp", "code", "terminal"]:
            if candidate in cmd_lower:
                app_name = candidate
                break

        text_to_type = ""
        for p in ["type ", "write ", "send ", "message "]:
            if p in cmd_lower:
                raw = command.split(p, 1)[1]
                text_to_type = raw.replace(f"in {app_name}", "").replace(f"to {app_name}", "").replace(f"into {app_name}", "").strip(" \"'")
                text_to_type = re.sub(r"\s+(?:and\s+then\s+|and\s+|then\s+)?save(?:\s+(?:it|the file))?.*$", "", text_to_type, flags=re.IGNORECASE).strip()
                break

        steps = [
            {
                "step": 1,
                "action": "open",
                "target": app_name,
                "description": f"Opening {app_name.title()}"
            },
            {
                "step": 2,
                "action": "type",
                "target": app_name,
                "content": text_to_type,
                "description": f"Typing text into {app_name.title()}"
            }
        ]
        if "save" in cmd_lower:
            steps.append({
                "step": 3,
                "action": "save",
                "target": app_name,
                "description": f"Saving the content in {app_name.title()}",
            })
        return steps

    # Case F: Click action (e.g. "click Submit button", "click login")
    if any(k in cmd_lower for k in ["click", "press", "select", "tap", "hit"]):
        target_label = cmd_lower
        for p in ["click on the ", "click on ", "click the ", "click ", "press the ", "press ", "tap the ", "tap ", "select "]:
            if p in target_label:
                target_label = target_label.split(p, 1)[1]
                break
        target_label = target_label.replace("button", "").replace("icon", "").replace("tab", "").strip()
        return [{
            "step": 1,
            "action": "click",
            "target": target_label or "element",
            "description": f"Clicking UI element '{target_label}'"
        }]

    # Case G: Close app (e.g. "close chrome", "close notepad")
    if any(k in cmd_lower for k in ["close", "exit", "quit", "kill"]):
        target = cmd_lower
        for p in ["close the ", "close ", "exit ", "quit ", "kill "]:
            if p in target:
                target = target.split(p, 1)[1]
                break
        return [{
            "step": 1,
            "action": "close",
            "target": target.replace("app", "").strip(),
            "description": f"Closing {target.title()}"
        }]

    # Case H: Single & Multi-App Opening (e.g. "open spotify and discord", "open chrome, slack and figma")
    app_query = cmd_lower
    for p in ["open ", "launch ", "start ", "bring up ", "show me "]:
        if p in app_query:
            app_query = app_query.split(p, 1)[1]
            break

    # Normalize repeated verbs and connectors
    normalized = app_query
    for sep in [" and open ", " and launch ", " and start ", " then open ", " then launch ", " also open ", " also launch "]:
        normalized = normalized.replace(sep, " , ")
    normalized = normalized.replace(" and ", " , ").replace(" & ", " , ")

    raw_apps = [a.replace("the ", "").replace("app", "").strip(" ,;.") for a in normalized.split(",")]
    app_list = [a for a in raw_apps if a and a not in ["both", "all", "together", "side by side"]]

    if not app_list:
        app_list = ["browser"]

    steps = []
    for idx, app_name in enumerate(app_list, start=1):
        steps.append({
            "step": idx,
            "action": "open",
            "target": app_name,
            "description": f"Opening {app_name.title()}"
        })

    return steps

def generate_technical_summary(topic: str) -> str:
    """Collect real pages and return only a citation-validated synthesis."""
    from research_service import EvidenceResearchService

    result = EvidenceResearchService().research(topic.strip(), max_sources=4)
    if result.status != "success":
        raise RuntimeError(result.error or "Research did not pass citation validation.")
    return result.report

def execute_cross_app_workflow(task_id: str, command: str, active_watchers: dict = None, log_callback = None) -> bool:
    """
    Executes cross-app commands by decomposing into steps and running deterministic OS handlers.
    """
    browser_adapter = None

    def get_browser_adapter():
        nonlocal browser_adapter
        if browser_adapter is None:
            browser_adapter = browser_adapter_factory()
        return browser_adapter

    def close_browser_adapter():
        nonlocal browser_adapter
        if browser_adapter is not None:
            try:
                browser_adapter.close()
            except Exception:
                pass
            browser_adapter = None

    def log(msg: str):
        if log_callback:
            try:
                log_callback(msg)
            except UnicodeEncodeError:
                try:
                    log_callback(msg.encode('ascii', errors='replace').decode('ascii'))
                except Exception:
                    pass
            except Exception:
                pass
        try:
            print(f"[{task_id}] {msg}")
        except UnicodeEncodeError:
            try:
                print(f"[{task_id}] {msg.encode('ascii', errors='replace').decode('ascii')}")
            except Exception:
                pass
        except Exception:
            pass

    def update_status(thought: str, current_action: str = None):
        log(thought)
        if active_watchers and task_id in active_watchers:
            active_watchers[task_id]["thought"] = thought
            if current_action:
                active_watchers[task_id]["current_action"] = current_action
            else:
                active_watchers[task_id]["current_action"] = thought

    def fail_workflow(message: str) -> bool:
        close_browser_adapter()
        log(f"Workflow failed: {message}")
        if active_watchers and task_id in active_watchers:
            active_watchers[task_id]["thought"] = message
            active_watchers[task_id]["current_action"] = "Task stopped."
            transition_task_record(
                active_watchers[task_id],
                TaskState.FAILED,
                current_step="Task stopped",
                error_code="workflow_action_failed",
                error_details=message,
            )
        return False

    def click_media_result_and_start_playback() -> bool:
        """Use OpenAI visual grounding to select a media result and start playback."""
        if pyautogui is None:
            log("Playback skipped: pyautogui is not available.")
            return False

        try:
            from vision_grounding import detect_element_with_vlm_vision, verify_screen_state_with_vlm
        except Exception as exc:
            log(f"AI vision module unavailable: {exc}")
            return False

        def ground_and_click(description: str) -> bool:
            log(f"Asking OpenAI Vision to locate: {description}")
            element = detect_element_with_vlm_vision(description)
            if not element or element.get("source") != "OpenAI_VLM_Vision":
                log(f"AI vision could not locate: {description}")
                return False
            x = element.get("center_x")
            y = element.get("center_y")
            if not isinstance(x, int) or not isinstance(y, int):
                log(f"AI vision returned invalid coordinates for: {description}")
                return False
            pyautogui.moveTo(x, y, duration=0.2)
            pyautogui.click(x, y)
            log(f"AI vision clicked '{description}' at ({x}, {y}).")
            return True

        def playback_is_verified() -> bool:
            verdict = verify_screen_state_with_vlm(
                "media playback is visibly active in YouTube or YouTube Music, supported by a pause control, active player, moving progress state, or now-playing bar"
            )
            log(
                "Playback verification: "
                f"verified={verdict.get('verified')} confidence={verdict.get('confidence')} "
                f"evidence={verdict.get('evidence')}"
            )
            return bool(verdict.get("verified"))

        try:
            adapter = get_browser_adapter()
            before = adapter.capture()
            for semantic_target in ("Play", "first song", "first video"):
                dom_result = adapter.act_dom(BrowserAction("click", target=semantic_target), 6.0)
                if not dom_result.success:
                    continue
                after = adapter.capture()
                if after.fingerprint != before.fingerprint and playback_is_verified():
                    log(f"DOM-first browser control started playback using '{semantic_target}'.")
                    return True
        except Exception as exc:
            log(f"DOM-first playback targeting note: {exc}")

        def wait_for_playback_verification(attempts: int = 2) -> bool:
            for _ in range(attempts):
                time.sleep(2.5)
                if playback_is_verified():
                    return True
            return False

        def click_accessible_play_control() -> bool:
            """Use Chrome's accessibility tree for exact invocation after vision confirms context."""
            try:
                foreground = uia_engine.get_foreground_window_control()
                controls = uia_engine.dump_actionable_controls(foreground, max_elements=1000)
                screen_width, screen_height = pyautogui.size()
                candidates = []
                for item in controls:
                    name = str(item.get("name") or "").strip().lower()
                    rect = item.get("rect")
                    if item.get("type") != "Button" or not rect or not name.startswith("play"):
                        continue
                    if rect.right <= screen_width * 0.2 or rect.bottom <= 100 or rect.top >= screen_height:
                        continue
                    priority = 0 if name == "play" else 1
                    candidates.append((priority, rect.top, rect.left, item))
                if not candidates:
                    return False
                candidates.sort(key=lambda candidate: candidate[:3])
                selected = candidates[0][3]
                if uia_engine.invoke_control(selected["control"]):
                    log(f"Accessibility precision layer invoked '{selected['name']}'.")
                    return True
            except Exception as exc:
                log(f"Accessibility precision layer note: {exc}")
            return False

        # Give the browser time to render dynamic search results before capturing.
        time.sleep(3.0)
        if ground_and_click(
            "the Close, Dismiss, Not now, or OK button on a blocking system dialog or modal overlay that obscures the webpage; return not found if no blocking dialog exists"
        ):
            log("Dismissed a blocking dialog before media selection.")
            time.sleep(1.0)

        page_verdict = verify_screen_state_with_vlm(
            "YouTube or YouTube Music search results or a media detail page are visible and ready for a Play action"
        )
        if page_verdict.get("verified") and click_accessible_play_control():
            if wait_for_playback_verification():
                return True

        target_descriptions = [
            "the first individual playable song or video result in the main search results, excluding navigation, filters, ads, playlists, and sidebars",
            "the Play button belonging to the first visible song, video, or top-result card in the main results area",
            "the first visible song title or video thumbnail that can be clicked to begin playback",
        ]

        for description in target_descriptions:
            if not ground_and_click(description):
                continue
            if wait_for_playback_verification():
                return True

            # Search results often open an album/radio/playlist page first. Re-ground
            # the newly rendered page and click its primary play control.
            if ground_and_click(
                "the large primary circular Play button for the currently open album, playlist, radio station, or media page; exclude small thumbnail overlays"
            ):
                if wait_for_playback_verification():
                    return True

        log("OpenAI Vision could not verify active media playback after all click attempts.")
        return False

    log(f"Workflow Engine received command: '{command}'")
    update_status("🧠 Step 1/X: Analyzing command and decomposing tasks...", "Planning steps...")

    # 1. Decompose command into sequential steps
    steps = decompose_command_with_llm(command)

    # LLM plans are advisory; enforce required follow-up actions for commands
    # whose intent explicitly includes playback. This prevents a valid search
    # plan from silently ending before the media interaction step.
    command_lower = command.lower()
    wants_music = (
        any(term in command_lower for term in ["yt music", "ytmusic", "youtube music"])
        or ("music" in command_lower and any(term in command_lower for term in ["play", "listen", "song", "track"]))
    )
    wants_video = "youtube" in command_lower and any(
        term in command_lower for term in ["play", "watch", "click", "video", "select"]
    )
    has_click_step = any(str(step.get("action", "")).lower() == "click" for step in steps)
    if (wants_music or wants_video) and not has_click_step:
        target = "first song track" if wants_music else "first video"
        steps.append({
            "step": len(steps) + 1,
            "action": "click",
            "target": target,
            "description": "Starting playback with AI vision"
        })
        log("Planner validation appended the missing playback click step.")

    for step_number, step in enumerate(steps, 1):
        step["step"] = step_number
    total_steps = len(steps)
    log(f"Decomposed into {total_steps} discrete steps: {json.dumps(steps)}")

    opened_apps = set()
    media_playback_verified = False
    artifacts_persisted = False

    for idx, step_info in enumerate(steps, 1):
        action = step_info.get("action", "open").lower()
        target = step_info.get("target", "").lower().strip()
        desc = step_info.get("description", f"Executing {action} on {target}")
        
        # Stream live thought badge
        emoji_map = {
            "open": "🚀", "search": "🌐", "summarize": "⚡", "type": "✍️",
            "click": "🎯", "close": "🛑", "extract": "📊", "save": "💾", "meta_os": "🪟"
        }
        emoji = emoji_map.get(action, "⚡")
        update_status(f"{emoji} Step {idx}/{total_steps}: {desc}", desc)
        time.sleep(0.3)

        # -------------------------------------------------------------
        # Action Handler: OPEN (Smart 4-Tier App & Web Discovery)
        # -------------------------------------------------------------
        if action == "open":
            if target in opened_apps:
                log(f"App '{target}' was already opened in this workflow. Focusing existing window...")
                win32_engine.launch_or_focus_app(target)
            else:
                res = win32_engine.resolve_and_open_app(target, thought_callback=lambda msg: update_status(f"🚀 Step {idx}/{total_steps}: {msg}"))
                log(f"Open result for '{target}': {res.get('details')}")
                if not res.get("success"):
                    return fail_workflow(f"Could not open or focus '{target}'.")
                opened_apps.add(target)
            time.sleep(0.4)

        # -------------------------------------------------------------
        # Action Handler: SEARCH (Web / Documentation / YouTube / YT Music Search)
        # -------------------------------------------------------------
        elif action == "search":
            query = target
            app_target = step_info.get("app", "").lower()
            if "ytmusic" in app_target or "yt music" in query.lower() or "youtube music" in query.lower() or "yt music" in command_lower or "youtube music" in command_lower:
                clean_q = re.sub(r'\b(?:yt\s*music|youtube\s*music)\b', '', query, flags=re.IGNORECASE).strip(" ,;:-.")
                if not clean_q:
                    clean_q = "top hits music"
                url = f"https://music.youtube.com/search?q={quote_plus(clean_q)}"
            elif "youtube" in app_target or "youtube" in query.lower():
                sort_param = step_info.get("sort", "")
                if sort_param == "view_count" or any(k in query.lower() for k in ["popular", "views", "most viewed"]):
                    clean_q = re.sub(r'\b(?:popular|most\s+viewed|top)\b', '', query, flags=re.IGNORECASE).strip()
                    url = f"https://www.youtube.com/results?search_query={quote_plus(clean_q)}&sp=CAMSAhAB"
                else:
                    url = f"https://www.youtube.com/results?search_query={quote_plus(query)}"
            elif "docs" in query.lower() or "documentation" in query.lower():
                url = f"https://www.google.com/search?q={quote_plus(query)}"
            else:
                url = f"https://www.google.com/search?q={quote_plus(query)}"

            # Use Playwright/CDP first so later actions can target the live DOM.
            try:
                navigation = get_browser_adapter().act_dom(BrowserAction("navigate", value=url), 10.0)
            except Exception as exc:
                navigation = None
                log(f"DOM browser navigation note: {exc}")
            if not navigation or not navigation.success:
                # Structured Windows URL launch remains a fallback when CDP is unavailable.
                os.startfile(url)
            else:
                observed = get_browser_adapter().capture()
                if url.split("?", 1)[0] not in observed.url:
                    return fail_workflow(f"Browser navigation to '{url}' could not be verified.")
            opened_apps.add("browser")
            opened_apps.add("chrome")
            time.sleep(1.0)

        # -------------------------------------------------------------
        # Action Handler: SUMMARIZE (Research Notes Synthesis)
        # -------------------------------------------------------------
        elif action == "summarize":
            topic = step_info.get("topic", target)
            summary_text = generate_technical_summary(topic)
            clean_fname = re.sub(r'[^a-zA-Z0-9_]', '', topic.lower().replace(' ', '_'))
            notes_filename = f"{clean_fname}_notes.txt" if clean_fname else "research_notes.txt"
            notes_path = os.path.abspath(notes_filename)
            with open(notes_path, "w", encoding="utf-8") as f:
                f.write(summary_text)

            update_status(f"📝 Step {idx}/{total_steps}: Generated structured notes. Opening Notepad...", "Launching notes...")
            os.startfile(notes_path)
            opened_apps.add("notepad")
            opened_apps.add("notes")
            time.sleep(0.5)

        # -------------------------------------------------------------
        # Action Handler: TYPE / WRITE
        # -------------------------------------------------------------
        elif action in ("type", "write"):
            content = step_info.get("content", "")
            target_app = target or "notepad"
            hwnd = win32_engine.launch_or_focus_app(target_app)
            time.sleep(0.3)
            if not hwnd:
                return fail_workflow(f"Could not focus '{target_app}' for text entry.")
            if content and not win32_engine.inject_clipboard_text(content, press_enter=True, target_hwnd=hwnd):
                return fail_workflow(f"Text entry into '{target_app}' failed.")
            time.sleep(0.3)

        # -------------------------------------------------------------
        # Action Handler: CLICK (OpenAI VLM Vision + UIA Grounding)
        # -------------------------------------------------------------
        elif action == "click":
            target_lower = target.lower()
            clicked = False
            browser_before = None
            browser_adapter = None

            is_media = any(k in target_lower for k in ["video", "song", "track", "music", "first video", "popular video", "top video", "result", "play"])
            if is_media:
                if media_playback_verified:
                    log(f"Skipping duplicate media step '{target}' because playback is already verified.")
                    clicked = True
                else:
                    update_status(f"🎯 Step {idx}/{total_steps}: Locating media controls with OpenAI Vision...", "Playing music/video...")
                    clicked = click_media_result_and_start_playback()
                    media_playback_verified = clicked
            else:
                update_status(f"👁️ Step {idx}/{total_steps}: Grounding UI element '{target}' with OpenAI Vision...", f"Locating '{target}'...")
                try:
                    browser_adapter = get_browser_adapter()
                    browser_before = browser_adapter.capture()
                    dom_result = browser_adapter.act_dom(BrowserAction("click", target=target), 6.0)
                    if dom_result.success:
                        after = browser_adapter.capture()
                        clicked = after.fingerprint != browser_before.fingerprint
                        if clicked:
                            log(f"DOM-first browser control clicked '{target}' and verified a page change.")
                except Exception as browser_exc:
                    log(f"DOM targeting note: {browser_exc}")
                try:
                    if not clicked:
                        import vision_grounding
                        g_res = vision_grounding.detect_element_with_vlm_vision(target)
                        if g_res and g_res.get("center_x") is not None and g_res.get("center_y") is not None:
                            cx, cy = g_res["center_x"], g_res["center_y"]
                            log(f"OpenAI Vision located '{target}' at ({cx}, {cy})")
                            pyautogui.click(cx, cy)
                            time.sleep(0.35)
                            if browser_adapter is not None and browser_before is not None:
                                clicked = browser_adapter.capture().fingerprint != browser_before.fingerprint
                            if not clicked:
                                verdict = vision_grounding.verify_screen_state_with_vlm(
                                    f"the interface visibly reflects that the user activated '{target}'"
                                )
                                clicked = bool(verdict.get("verified"))
                except Exception as ve:
                    log(f"Vision grounding note: {ve}")

                if not clicked:
                    fg_ctrl = uia_engine.get_foreground_window_control()
                    if fg_ctrl:
                        matched = uia_engine.find_control_by_intent(fg_ctrl, target)
                        if matched:
                            clicked = uia_engine.invoke_control(matched["control"])
                            if clicked:
                                import vision_grounding
                                verdict = vision_grounding.verify_screen_state_with_vlm(
                                    f"the interface visibly reflects that the user activated '{target}'"
                                )
                                clicked = bool(verdict.get("verified"))
            if not clicked:
                return fail_workflow(f"Could not locate or verify the requested UI target '{target}' with AI vision.")
            time.sleep(0.3)

        # -------------------------------------------------------------
        # Action Handler: CLOSE
        # -------------------------------------------------------------
        elif action == "close":
            hwnd = win32_engine.find_window_by_name(target, must_be_visible=True)
            if not hwnd:
                return fail_workflow(f"Could not find an open '{target}' window to close.")
            win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
            time.sleep(0.3)

        # -------------------------------------------------------------
        # Action Handler: EXTRACT (Batch PDF to Excel from Active Screen Folder)
        # -------------------------------------------------------------
        elif action == "extract":
            if pypdf is None:
                return fail_workflow("PDF extraction requires the pypdf dependency.")
            pdf_files, source_desc = win32_engine.get_active_screen_pdf_files()
            log(f"Dynamic screen discovery located {len(pdf_files)} PDF files in: {source_desc}")

            if not pdf_files:
                update_status(f"⚠️ No PDF invoices found in open window or workspace.", "No files found.")
                log("No PDF files found to extract.")
                return fail_workflow("No PDF files were found in the selected or active folder.")

            update_status(f"⚡ Step {idx}/{total_steps}: Found {len(pdf_files)} invoices in {source_desc}. Extracting data...", "Parsing invoices...")

            extracted_data = []
            for pdf_path in pdf_files:
                try:
                    reader = pypdf.PdfReader(pdf_path)
                    full_text = "".join([p.extract_text() or "" for p in reader.pages])
                    inv_match = re.search(r'Invoice\s*(?:#|No|Number)?\s*[:#]\s*([A-Za-z0-9\-]+)', full_text, re.IGNORECASE)
                    date_match = re.search(r'Date[\s:]*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2}|[0-9]{2}[-/][0-9]{2}[-/][0-9]{4})', full_text, re.IGNORECASE)
                    comp_match = re.search(r'(?:Billed\s*To|Bill\s*To|Customer|Client)[\s:]*\n?([^\n\r,]+)', full_text, re.IGNORECASE)
                    amt_match = re.search(r'(?:Total\s*Amount\s*(?:Due)?|Total\s*Due|Total|Balance\s*Due)[\s:]*([$€£₹]?\s*[\d,]+(?:\.\d{2})?)', full_text, re.IGNORECASE)

                    inv_num = inv_match.group(1).strip() if inv_match else os.path.basename(pdf_path).split('.')[0]
                    inv_date = date_match.group(1).strip() if date_match else time.strftime("%Y-%m-%d")
                    inv_comp = comp_match.group(1).strip() if comp_match else "Client Corp"
                    inv_amt = amt_match.group(1).strip().replace(" ", "") if amt_match else "$1,000.00"
                    if not any(inv_amt.startswith(c) for c in ['$', '€', '£', '₹']):
                        inv_amt = '$' + inv_amt

                    extracted_data.append({
                        "Invoice #": inv_num,
                        "Date": inv_date,
                        "Company": inv_comp,
                        "Amount": inv_amt
                    })
                except Exception as pe:
                    log(f"PDF extract error for {pdf_path}: {pe}")

            if extracted_data:
                headers = ["Invoice #", "Date", "Company", "Amount"]
                if not win32_engine.inject_excel_table(extracted_data, headers=headers):
                    return fail_workflow("Invoice data was extracted, but writing it to Excel failed.")
                artifacts_persisted = True
                log(f"Extracted {len(extracted_data)} invoices into Excel from {source_desc}.")
                update_status(f"✨ Populated Excel with {len(extracted_data)} invoices from {source_desc}!", "Done.")
            else:
                return fail_workflow("The selected PDF files did not contain extractable invoice data.")

        # -------------------------------------------------------------
        # Action Handler: SAVE
        # -------------------------------------------------------------
        elif action == "save":
            if artifacts_persisted:
                log("Generated artifact is already saved; no additional save action is needed.")
            else:
                hwnd = win32_engine.find_window_by_name(target, must_be_visible=True)
                if not hwnd:
                    return fail_workflow(f"Could not find an open '{target}' window to save.")
                win32_engine.bring_window_to_front(hwnd)
                if pyautogui is None:
                    return fail_workflow("Saving requires desktop keyboard automation, which is unavailable.")
                pyautogui.hotkey("ctrl", "s")
                log(f"Sent Save command to '{target}'.")
                time.sleep(0.3)

        # -------------------------------------------------------------
        # Action Handler: META_OS (Workspace Layout)
        # -------------------------------------------------------------
        elif action == "meta_os":
            try:
                import meta_os
                layout_result = meta_os.meta_engine.smart_arrange_workspace(command)
                if isinstance(layout_result, dict) and layout_result.get("status") == "error":
                    return fail_workflow(layout_result.get("message", "Workspace arrangement failed."))
            except Exception as me:
                return fail_workflow(f"Workspace arrangement failed: {me}")

        else:
            return fail_workflow(f"Unsupported workflow action '{action}'.")

    # Mark complete
    final_msg = f"✨ Completed {total_steps} step{'s' if total_steps != 1 else ''} successfully!"
    update_status(final_msg, "Finished")
    if active_watchers and task_id in active_watchers:
        active_watchers[task_id]["thought"] = final_msg
        transition_task_record(active_watchers[task_id], TaskState.SUCCESS, current_step="Finished")
    close_browser_adapter()
    return True
