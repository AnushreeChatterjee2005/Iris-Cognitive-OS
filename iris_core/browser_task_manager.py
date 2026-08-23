"""Threaded task manager that exposes the bounded browser loop to the IRIS API."""

from __future__ import annotations

import threading
from typing import Any, Callable, Optional

from browser_automation import (
    BrowserAction,
    BrowserAutomationLoop,
    BrowserLoopConfig,
    OpenAIActionPlanner,
    PlaywrightCDPAdapter,
    SuccessCriteria,
)
from task_state import InvalidTaskTransition, TaskLifecycle, TaskState, TERMINAL_STATES


SENSITIVE_TERMS = {
    "password", "credential", "payment", "purchase", "buy", "checkout", "bank",
    "delete", "remove account", "upload", "download", "install", "send message",
    "submit", "publish", "post", "transfer", "confirm order",
}


class BrowserTask:
    def __init__(self, task_id: str, objective: str, criteria: SuccessCriteria, initial_url: str = ""):
        self.lifecycle = TaskLifecycle(task_id=task_id, objective=objective)
        self.criteria = criteria
        self.initial_url = initial_url
        self.timeline: list[dict[str, Any]] = []
        self.cancellation_event = threading.Event()
        self.confirmation_event = threading.Event()
        self.confirmation_request: Optional[dict[str, Any]] = None
        self._confirmation_approved = False

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.lifecycle.to_dict(),
            "initial_url": self.initial_url,
            "timeline": list(self.timeline),
            "confirmation_request": self.confirmation_request,
        }


class BrowserTaskManager:
    def __init__(
        self,
        adapter_factory: Callable[[], Any] = PlaywrightCDPAdapter,
        planner_factory: Callable[[], Any] = OpenAIActionPlanner,
    ):
        self.adapter_factory = adapter_factory
        self.planner_factory = planner_factory
        self.tasks: dict[str, BrowserTask] = {}
        self._lock = threading.RLock()

    @staticmethod
    def _requires_confirmation(action: BrowserAction) -> bool:
        material = f"{action.action} {action.target} {action.value}".lower()
        return any(term in material for term in SENSITIVE_TERMS)

    def start_task(
        self,
        task_id: str,
        objective: str,
        criteria: SuccessCriteria,
        initial_url: str = "",
        config: Optional[BrowserLoopConfig] = None,
    ) -> BrowserTask:
        task = BrowserTask(task_id, objective, criteria, initial_url)
        with self._lock:
            self.tasks[task_id] = task
        threading.Thread(
            target=self._run_task,
            args=(task, config or BrowserLoopConfig()),
            daemon=True,
            name=f"iris-browser-{task_id[:8]}",
        ).start()
        return task

    def _run_task(self, task: BrowserTask, config: BrowserLoopConfig) -> None:
        adapter = None
        try:
            task.lifecycle.transition(TaskState.RUNNING, current_step="Connecting to IRIS browser")
            adapter = self.adapter_factory()
            if task.initial_url:
                initial_action = BrowserAction("navigate", value=task.initial_url, reason="Open requested starting page")
                initial_action.validate()
                before = adapter.capture()
                result = adapter.act_dom(initial_action, config.action_timeout_seconds)
                if not result.success:
                    raise RuntimeError(f"Initial navigation failed: {result.details}")
                after = adapter.capture()
                expected_host = task.initial_url.split("/", 3)[2].lower()
                navigation_verified = after.fingerprint != before.fingerprint and expected_host in after.url.lower()
                task.timeline.append({
                    "step": 0,
                    "event": "initial_navigation",
                    "url": after.url,
                    "method": result.method,
                    "verified": navigation_verified,
                    "details": result.details,
                })
                if not navigation_verified:
                    raise RuntimeError("Initial navigation completed without a verified page or URL change")

            def confirm(action: BrowserAction) -> bool:
                if not self._requires_confirmation(action):
                    return True
                task.confirmation_request = {
                    "action": action.action,
                    "target": action.target,
                    "value": action.value,
                    "reason": action.reason,
                }
                task.lifecycle.transition(TaskState.WAITING, current_step="Waiting for sensitive-action confirmation")
                task.confirmation_event.clear()
                task.confirmation_event.wait(timeout=min(60.0, config.total_timeout_seconds))
                approved = task._confirmation_approved and not task.cancellation_event.is_set()
                if approved:
                    task.lifecycle.transition(TaskState.RUNNING, current_step="Sensitive action approved")
                task.confirmation_request = None
                return approved

            loop = BrowserAutomationLoop(adapter, self.planner_factory(), config)
            outcome = loop.run(
                task.lifecycle.objective,
                task.criteria,
                cancellation_event=task.cancellation_event,
                confirmation_callback=confirm,
            )
            task.timeline.extend(outcome.timeline)
            for retry_index in range(outcome.retries):
                task.lifecycle.record_retry(f"Browser action retry {retry_index + 1}")
            for item in outcome.evidence:
                task.lifecycle.add_evidence({"type": "browser_verification", "details": item})
            if outcome.state == "success":
                task.lifecycle.transition(TaskState.SUCCESS, current_step=outcome.reason)
            elif outcome.state == "cancelled":
                task.lifecycle.transition(TaskState.CANCELLED, current_step=outcome.reason)
            elif outcome.state == "waiting":
                task.lifecycle.transition(TaskState.WAITING, current_step=outcome.reason)
            else:
                task.lifecycle.transition(
                    TaskState.FAILED,
                    current_step="Browser task failed",
                    error_code="browser_loop_failed",
                    error_details=outcome.reason,
                )
        except Exception as exc:
            if task.lifecycle.state not in TERMINAL_STATES:
                try:
                    task.lifecycle.transition(
                        TaskState.FAILED,
                        current_step="Browser task failed",
                        error_code="browser_runtime_error",
                        error_details=str(exc),
                    )
                except InvalidTaskTransition:
                    pass
        finally:
            if adapter and hasattr(adapter, "close"):
                adapter.close()

    def get_task(self, task_id: str) -> Optional[BrowserTask]:
        return self.tasks.get(task_id)

    def cancel_task(self, task_id: str) -> bool:
        task = self.get_task(task_id)
        if not task or task.lifecycle.state in TERMINAL_STATES:
            return False
        task.lifecycle.request_cancellation()
        task.cancellation_event.set()
        task.confirmation_event.set()
        return True

    def resume_task(self, task_id: str, config: Optional[BrowserLoopConfig] = None) -> bool:
        task = self.get_task(task_id)
        if not task or task.lifecycle.state != TaskState.WAITING or task.confirmation_request:
            return False
        threading.Thread(
            target=self._run_task,
            args=(task, config or BrowserLoopConfig()),
            daemon=True,
            name=f"iris-browser-resume-{task_id[:8]}",
        ).start()
        return True

    def confirm_task(self, task_id: str, approved: bool) -> bool:
        task = self.get_task(task_id)
        if not task or task.lifecycle.state != TaskState.WAITING or not task.confirmation_request:
            return False
        task._confirmation_approved = approved
        if not approved:
            task.cancellation_event.set()
        task.confirmation_event.set()
        return True


browser_task_manager = BrowserTaskManager()
