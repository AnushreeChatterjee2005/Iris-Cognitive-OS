"""Bounded DOM-first browser automation with accessibility and vision fallbacks."""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import json
import os
import re
import subprocess
import threading
import time
from typing import Any, Callable, Optional, Protocol
from urllib.parse import urlparse


ACTION_TYPES = {
    "navigate", "search", "click", "type", "submit", "scroll", "wait",
    "extract", "inspect", "open_tab", "switch_tab", "close_tab", "download", "complete",
}
BLOCKER_PATTERNS = {
    "captcha": ("captcha", "verify you are human", "unusual traffic"),
    "login_required": ("sign in to continue", "log in to continue", "authentication required"),
    "permission_required": ("allow access", "permission required", "enable notifications"),
    "access_blocked": ("access denied", "temporarily blocked", "request blocked"),
    "unsupported_page": ("your browser is not supported", "unsupported browser", "page isn't working"),
    "browser_error": ("this site can't be reached", "err_connection_", "page crashed"),
}


@dataclass(frozen=True)
class BrowserAction:
    action: str
    target: str = ""
    value: str = ""
    direction: str = "down"
    amount: int = 700
    reason: str = ""

    def validate(self) -> None:
        if self.action not in ACTION_TYPES:
            raise ValueError(f"Unsupported browser action: {self.action}")
        if self.action in {"click", "type", "search", "switch_tab", "download"} and not self.target.strip():
            raise ValueError(f"{self.action} requires a target")
        if self.action in {"navigate", "open_tab"} and self.value:
            parsed = urlparse(self.value)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("Navigation requires an absolute HTTP(S) URL")
        if self.action == "navigate" and not self.value:
            raise ValueError("Navigation requires a URL")
        if self.action in {"type", "search"} and not self.value:
            raise ValueError(f"{self.action} requires a value")
        if self.action == "scroll" and self.direction not in {"up", "down"}:
            raise ValueError("Scroll direction must be up or down")


@dataclass(frozen=True)
class BrowserObservation:
    url: str
    title: str
    visible_text: str
    scroll_y: int
    viewport_height: int
    document_height: int
    dom_hash: str
    screenshot_hash: str = ""
    loading: bool = False

    @property
    def at_end_of_page(self) -> bool:
        return self.scroll_y + self.viewport_height >= self.document_height - 4

    @property
    def fingerprint(self) -> str:
        return f"{self.url}|{self.dom_hash}|{self.screenshot_hash}|{self.scroll_y}"


@dataclass(frozen=True)
class ActionResult:
    success: bool
    method: str
    details: str


@dataclass
class BrowserLoopConfig:
    max_steps: int = 24
    max_retries_per_action: int = 2
    repeated_state_limit: int = 3
    action_timeout_seconds: float = 8.0
    total_timeout_seconds: float = 90.0
    loading_retries: int = 4


@dataclass(frozen=True)
class SuccessCriteria:
    expected_url_contains: str = ""
    expected_text: str = ""
    custom: Optional[Callable[[BrowserObservation], bool]] = None

    def __post_init__(self):
        if not (self.expected_url_contains or self.expected_text or self.custom):
            raise ValueError("At least one explicit success criterion is required")

    def evaluate(self, observation: BrowserObservation) -> tuple[bool, list[str]]:
        evidence: list[str] = []
        matches: list[bool] = []
        if self.expected_url_contains:
            matched = self.expected_url_contains.lower() in observation.url.lower()
            matches.append(matched)
            if matched:
                evidence.append(f"URL contains '{self.expected_url_contains}'")
        if self.expected_text:
            matched = self.expected_text.lower() in observation.visible_text.lower()
            matches.append(matched)
            if matched:
                evidence.append(f"Page contains '{self.expected_text}'")
        if self.custom:
            matched = bool(self.custom(observation))
            matches.append(matched)
            if matched:
                evidence.append("Custom success verifier passed")
        return bool(matches) and all(matches), evidence


@dataclass
class BrowserLoopOutcome:
    state: str
    reason: str
    steps: int
    retries: int
    evidence: list[str] = field(default_factory=list)
    timeline: list[dict[str, Any]] = field(default_factory=list)
    final_observation: Optional[BrowserObservation] = None


class BrowserAdapter(Protocol):
    def capture(self) -> BrowserObservation: ...
    def act_dom(self, action: BrowserAction, timeout_seconds: float) -> ActionResult: ...
    def act_accessibility(self, action: BrowserAction, timeout_seconds: float) -> ActionResult: ...
    def act_vision(self, action: BrowserAction, timeout_seconds: float) -> ActionResult: ...


class BrowserPlanner(Protocol):
    def next_action(
        self,
        objective: str,
        observation: BrowserObservation,
        history: list[dict[str, Any]],
    ) -> BrowserAction: ...


class BrowserAutomationLoop:
    def __init__(
        self,
        adapter: BrowserAdapter,
        planner: BrowserPlanner,
        config: Optional[BrowserLoopConfig] = None,
    ):
        self.adapter = adapter
        self.planner = planner
        self.config = config or BrowserLoopConfig()

    @staticmethod
    def _blocker(observation: BrowserObservation) -> Optional[tuple[str, str]]:
        text = observation.visible_text.lower()
        for blocker, patterns in BLOCKER_PATTERNS.items():
            if any(pattern in text for pattern in patterns):
                state = "waiting" if blocker in {"captcha", "login_required", "permission_required"} else "failed"
                return state, blocker
        return None

    def run(
        self,
        objective: str,
        success_criteria: SuccessCriteria,
        cancellation_event: Optional[threading.Event] = None,
        confirmation_callback: Optional[Callable[[BrowserAction], bool]] = None,
    ) -> BrowserLoopOutcome:
        started = time.monotonic()
        timeline: list[dict[str, Any]] = []
        seen_states: dict[str, int] = {}
        seen_action_states: dict[str, int] = {}
        retries = 0
        observation: Optional[BrowserObservation] = None

        def finish(state: str, reason: str, step: int, evidence: Optional[list[str]] = None):
            return BrowserLoopOutcome(
                state=state,
                reason=reason,
                steps=step,
                retries=retries,
                evidence=evidence or [],
                timeline=timeline,
                final_observation=observation,
            )

        for step in range(self.config.max_steps + 1):
            if cancellation_event and cancellation_event.is_set():
                return finish("cancelled", "Cancellation requested", step)
            if time.monotonic() - started >= self.config.total_timeout_seconds:
                return finish("failed", "Total browser workflow timeout exceeded", step)

            observation = self.adapter.capture()
            loading_attempts = 0
            while observation.loading and loading_attempts < self.config.loading_retries:
                time.sleep(0.25)
                observation = self.adapter.capture()
                loading_attempts += 1
            timeline.append({
                "step": step,
                "event": "observation",
                "url": observation.url,
                "title": observation.title[:300],
                "dom_hash": observation.dom_hash,
                "screenshot_hash": observation.screenshot_hash,
                "scroll_y": observation.scroll_y,
                "at_end_of_page": observation.at_end_of_page,
                "loading_retries": loading_attempts,
            })

            blocker = self._blocker(observation)
            if blocker:
                blocker_state, blocker_code = blocker
                return finish(blocker_state, f"Browser stopped at blocker: {blocker_code}", step)

            successful, evidence = success_criteria.evaluate(observation)
            if successful:
                timeline.append({"step": step, "event": "verified", "evidence": evidence})
                return finish("success", "Explicit success criteria verified", step, evidence)

            seen_states[observation.fingerprint] = seen_states.get(observation.fingerprint, 0) + 1
            if seen_states[observation.fingerprint] >= self.config.repeated_state_limit:
                return finish("failed", "Repeated browser state detected; stopping to prevent an infinite loop", step)
            if step >= self.config.max_steps:
                return finish("failed", "Maximum browser steps reached", step)

            try:
                action = self.planner.next_action(objective, observation, timeline)
                action.validate()
            except Exception as exc:
                return finish("failed", f"Planner returned an invalid action: {exc}", step)

            if action.action == "complete":
                return finish("failed", "Planner claimed completion before success criteria were verified", step)

            if confirmation_callback and not confirmation_callback(action):
                return finish("cancelled", "User declined the requested browser action", step)

            before = observation
            action_key = f"{before.fingerprint}|{json.dumps(action.__dict__, sort_keys=True)}"
            seen_action_states[action_key] = seen_action_states.get(action_key, 0) + 1
            if seen_action_states[action_key] >= self.config.repeated_state_limit:
                return finish("failed", "Repeated action sequence detected; stopping to prevent an infinite loop", step)
            action_succeeded = False
            action_result = ActionResult(False, "none", "No targeting method succeeded")
            for attempt in range(self.config.max_retries_per_action + 1):
                if attempt:
                    retries += 1
                for method in (self.adapter.act_dom, self.adapter.act_accessibility, self.adapter.act_vision):
                    action_result = method(action, self.config.action_timeout_seconds)
                    timeline.append({
                        "step": step + 1,
                        "event": "action_attempt",
                        "action": action.action,
                        "target": action.target[:300],
                        "method": action_result.method,
                        "attempt": attempt + 1,
                        "success": action_result.success,
                        "details": action_result.details[:1000],
                    })
                    if action_result.success:
                        action_succeeded = True
                        break
                if not action_succeeded:
                    continue

                observation = self.adapter.capture()
                post_loading_attempts = 0
                while observation.loading and post_loading_attempts < self.config.loading_retries:
                    time.sleep(0.25)
                    observation = self.adapter.capture()
                    post_loading_attempts += 1
                page_changed = observation.fingerprint != before.fingerprint
                no_change_required = action.action in {"wait", "extract", "inspect"}
                timeline.append({
                    "step": step + 1,
                    "event": "verification",
                    "action": action.action,
                    "page_changed": page_changed,
                    "loading_retries": post_loading_attempts,
                    "before_fingerprint": before.fingerprint,
                    "after_fingerprint": observation.fingerprint,
                })
                if page_changed or no_change_required:
                    break
                action_succeeded = False

            timeline.append({
                "step": step + 1,
                "action": action.action,
                "target": action.target,
                "method": action_result.method,
                "success": action_succeeded,
                "details": action_result.details,
            })

            if action.action == "scroll" and action.direction == "down" and before.at_end_of_page:
                return finish("failed", "Reached the end of the page without satisfying success criteria", step + 1)
            if not action_succeeded:
                return finish("failed", f"Action could not be executed or verified: {action_result.details}", step + 1)

        return finish("failed", "Browser loop ended unexpectedly", self.config.max_steps)


class OpenAIActionPlanner:
    """Responses API planner; only invoked during live browser automation."""

    def next_action(self, objective: str, observation: BrowserObservation, history: list[dict[str, Any]]) -> BrowserAction:
        from openai import OpenAI

        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        client = OpenAI(api_key=key, timeout=12.0, max_retries=1)
        schema = {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": sorted(ACTION_TYPES)},
                "target": {"type": "string"},
                "value": {"type": "string"},
                "direction": {"type": "string", "enum": ["up", "down"]},
                "amount": {"type": "integer", "minimum": 100, "maximum": 1600},
                "reason": {"type": "string"},
            },
            "required": ["action", "target", "value", "direction", "amount", "reason"],
            "additionalProperties": False,
        }
        prompt = {
            "objective": objective,
            "page": {
                "url": observation.url,
                "title": observation.title,
                "visible_text": observation.visible_text[:10000],
                "at_end_of_page": observation.at_end_of_page,
            },
            "recent_history": history[-8:],
        }
        response = client.responses.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            instructions=(
                "Choose exactly one safe next browser action. Prefer semantic DOM targets such as visible labels, "
                "roles, and link text. Never claim complete unless the caller's explicit verifier can prove it."
            ),
            input=json.dumps(prompt, ensure_ascii=False),
            text={"format": {"type": "json_schema", "name": "browser_action", "schema": schema, "strict": True}},
            max_output_tokens=300,
            store=False,
        )
        return BrowserAction(**json.loads(response.output_text))


class PlaywrightCDPAdapter:
    """Connects to an IRIS Chrome profile and performs semantic DOM operations first."""

    def __init__(self, cdp_url: Optional[str] = None, profile_dir: Optional[str] = None):
        self.cdp_url = cdp_url or os.environ.get("IRIS_BROWSER_CDP_URL", "http://127.0.0.1:9222")
        parsed_cdp = urlparse(self.cdp_url)
        if parsed_cdp.scheme != "http" or parsed_cdp.hostname not in {"127.0.0.1", "localhost"} or not parsed_cdp.port:
            raise ValueError("IRIS browser CDP URL must be an HTTP loopback URL with an explicit port")
        local_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        self.profile_dir = profile_dir or os.path.join(local_data, "IRIS", "browser-profile")
        self._playwright = None
        self._browser = None
        self._page = None
        self._chrome_process: Optional[subprocess.Popen] = None

    @staticmethod
    def _chrome_candidates() -> list[str]:
        roots = [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")]
        suffixes = [
            os.path.join("Google", "Chrome", "Application", "chrome.exe"),
            os.path.join("Microsoft", "Edge", "Application", "msedge.exe"),
        ]
        return [os.path.join(root, suffix) for root in roots if root for suffix in suffixes]

    def connect(self) -> None:
        from playwright.sync_api import sync_playwright

        if self._page is not None:
            return
        self._playwright = sync_playwright().start()
        try:
            self._browser = self._playwright.chromium.connect_over_cdp(self.cdp_url)
        except Exception:
            executable = next((path for path in self._chrome_candidates() if os.path.isfile(path)), None)
            if not executable:
                self.close()
                raise RuntimeError("Chrome or Edge was not found for CDP automation")
            os.makedirs(self.profile_dir, exist_ok=True)
            port = urlparse(self.cdp_url).port or 9222
            self._chrome_process = subprocess.Popen([
                executable,
                f"--remote-debugging-port={port}",
                f"--user-data-dir={self.profile_dir}",
                "--no-first-run",
                "--no-default-browser-check",
                "about:blank",
            ])
            last_error: Optional[Exception] = None
            for _ in range(20):
                try:
                    time.sleep(0.25)
                    self._browser = self._playwright.chromium.connect_over_cdp(self.cdp_url)
                    break
                except Exception as exc:
                    last_error = exc
            if self._browser is None:
                self.close()
                raise RuntimeError(f"Could not connect to the IRIS browser over CDP: {last_error}")
        context = self._browser.contexts[0]
        self._page = context.pages[-1] if context.pages else context.new_page()

    @property
    def page(self):
        self.connect()
        return self._page

    def capture(self) -> BrowserObservation:
        page = self.page
        metrics = page.evaluate("""() => ({
            scrollY: Math.round(window.scrollY),
            viewportHeight: window.innerHeight,
            documentHeight: Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0),
            readyState: document.readyState,
            text: (document.body?.innerText || '').slice(0, 20000),
            controls: Array.from(document.querySelectorAll('input, textarea, select, button, [role]'))
              .slice(0, 500)
              .map(el => [el.tagName, el.getAttribute('role') || '', el.getAttribute('aria-label') || '',
                el.getAttribute('placeholder') || '', 'value' in el ? String(el.value).slice(0, 200) : '',
                el.getAttribute('aria-checked') || '', el.getAttribute('aria-selected') || ''].join('|'))
        })""")
        text = metrics.get("text", "")
        dom_material = f"{page.url}\n{text}\n" + "\n".join(metrics.get("controls", []))
        screenshot = page.screenshot(type="jpeg", quality=35)
        return BrowserObservation(
            url=page.url,
            title=page.title(),
            visible_text=text,
            scroll_y=int(metrics.get("scrollY", 0)),
            viewport_height=int(metrics.get("viewportHeight", 0)),
            document_height=int(metrics.get("documentHeight", 0)),
            dom_hash=hashlib.sha256(dom_material.encode("utf-8", errors="ignore")).hexdigest(),
            screenshot_hash=hashlib.sha256(screenshot).hexdigest(),
            loading=metrics.get("readyState") != "complete",
        )

    def _semantic_locator(self, target: str):
        page = self.page
        candidates = []
        for role in ("button", "link", "textbox", "option", "tab", "menuitem", "checkbox", "radio"):
            candidates.append(page.get_by_role(role, name=re.compile(re.escape(target), re.IGNORECASE)))
        candidates.extend([
            page.get_by_label(re.compile(re.escape(target), re.IGNORECASE)),
            page.get_by_placeholder(re.compile(re.escape(target), re.IGNORECASE)),
            page.get_by_text(target, exact=False),
        ])
        for locator in candidates:
            try:
                if locator.count() and locator.first.is_visible():
                    return locator.first
            except Exception:
                continue
        return None

    def act_dom(self, action: BrowserAction, timeout_seconds: float) -> ActionResult:
        page = self.page
        timeout_ms = int(timeout_seconds * 1000)
        try:
            if action.action == "navigate":
                page.goto(action.value, wait_until="domcontentloaded", timeout=timeout_ms)
            elif action.action == "open_tab":
                context = page.context
                self._page = context.new_page()
                if action.value:
                    self._page.goto(action.value, wait_until="domcontentloaded", timeout=timeout_ms)
            elif action.action == "switch_tab":
                target = action.target.lower()
                matched = next((candidate for candidate in page.context.pages if target in candidate.url.lower() or target in candidate.title().lower()), None)
                if not matched:
                    return ActionResult(False, "dom", f"No browser tab matched '{action.target}'")
                self._page = matched
                matched.bring_to_front()
            elif action.action == "close_tab":
                context = page.context
                if len(context.pages) <= 1:
                    return ActionResult(False, "dom", "Refusing to close the final IRIS browser tab")
                page.close()
                self._page = context.pages[-1]
            elif action.action == "scroll":
                delta = abs(action.amount) * (1 if action.direction == "down" else -1)
                page.evaluate("delta => window.scrollBy({top: delta, behavior: 'instant'})", delta)
            elif action.action == "wait":
                page.wait_for_timeout(min(timeout_ms, max(100, action.amount)))
            elif action.action in {"extract", "inspect"}:
                return ActionResult(True, "dom", "Page content captured from the DOM")
            elif action.action in {"click", "type", "search", "download"}:
                locator = self._semantic_locator(action.target)
                if locator is None:
                    return ActionResult(False, "dom", f"No semantic DOM target matched '{action.target}'")
                if action.action == "click":
                    pages_before = len(page.context.pages)
                    locator.click(timeout=timeout_ms)
                    page.wait_for_timeout(min(500, timeout_ms))
                    if len(page.context.pages) > pages_before:
                        self._page = page.context.pages[-1]
                        self._page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
                elif action.action in {"type", "search"}:
                    locator.fill(action.value, timeout=timeout_ms)
                    if action.action == "search":
                        locator.press("Enter", timeout=timeout_ms)
                else:
                    with page.expect_download(timeout=timeout_ms) as download_info:
                        locator.click(timeout=timeout_ms)
                    download = download_info.value
                    return ActionResult(True, "dom", f"Download started: {download.suggested_filename}")
            elif action.action == "submit":
                locator = self._semantic_locator(action.target) if action.target else None
                if locator is not None:
                    locator.click(timeout=timeout_ms)
                else:
                    submitted = page.evaluate("""() => {
                      const active = document.activeElement;
                      const form = active?.closest?.('form') || document.querySelector('form');
                      if (!form) return false;
                      form.requestSubmit();
                      return true;
                    }""")
                    if not submitted:
                        return ActionResult(False, "dom", "No form or semantic submit control was available")
            else:
                return ActionResult(False, "dom", f"DOM does not handle {action.action}")
            return ActionResult(True, "dom", f"Executed {action.action} through Playwright DOM")
        except Exception as exc:
            return ActionResult(False, "dom", str(exc))

    def act_accessibility(self, action: BrowserAction, timeout_seconds: float) -> ActionResult:
        if action.action not in {"click", "submit"}:
            return ActionResult(False, "accessibility", "Accessibility fallback handles click and submit actions")
        try:
            import uia_engine
            control = uia_engine.get_foreground_window_control()
            match = uia_engine.find_control_by_intent(control, action.target) if control else None
            if match and uia_engine.invoke_control(match["control"]):
                return ActionResult(True, "accessibility", f"Invoked accessible control '{action.target}'")
            return ActionResult(False, "accessibility", f"No accessible control matched '{action.target}'")
        except Exception as exc:
            return ActionResult(False, "accessibility", str(exc))

    def act_vision(self, action: BrowserAction, timeout_seconds: float) -> ActionResult:
        if action.action not in {"click", "submit"}:
            return ActionResult(False, "vision", "Vision fallback handles click and submit actions")
        try:
            import pyautogui
            from vision_grounding import detect_element_with_vlm_vision
            result = detect_element_with_vlm_vision(action.target or "visible submit control", timeout_seconds=timeout_seconds)
            if not result or result.get("source") != "OpenAI_VLM_Vision":
                return ActionResult(False, "vision", "OpenAI vision returned not_found")
            x, y = result.get("center_x"), result.get("center_y")
            if not isinstance(x, int) or not isinstance(y, int):
                return ActionResult(False, "vision", "OpenAI vision returned invalid coordinates")
            pyautogui.click(x, y)
            return ActionResult(True, "vision", f"Clicked visually grounded target '{action.target}'")
        except Exception as exc:
            return ActionResult(False, "vision", str(exc))

    def close(self) -> None:
        # Disconnect Playwright without closing the persistent IRIS browser.
        # Login and user-takeover state therefore survives between tasks.
        if self._playwright:
            try:
                self._playwright.stop()
            except Exception:
                pass
        self._browser = None
        self._playwright = None
        self._page = None
