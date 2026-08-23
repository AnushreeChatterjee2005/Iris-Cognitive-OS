"""Shared truthful lifecycle contract for every IRIS automation task."""

from dataclasses import dataclass, field
from enum import Enum
import threading
import time
from typing import Any, Optional


class TaskState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING = "waiting"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_STATES = {TaskState.SUCCESS, TaskState.FAILED, TaskState.CANCELLED}
VALID_TRANSITIONS = {
    TaskState.QUEUED: {TaskState.RUNNING, TaskState.FAILED, TaskState.CANCELLED},
    TaskState.RUNNING: {TaskState.WAITING, TaskState.SUCCESS, TaskState.FAILED, TaskState.CANCELLED},
    TaskState.WAITING: {TaskState.RUNNING, TaskState.FAILED, TaskState.CANCELLED},
    TaskState.SUCCESS: set(),
    TaskState.FAILED: set(),
    TaskState.CANCELLED: set(),
}


class InvalidTaskTransition(ValueError):
    pass


@dataclass
class TaskLifecycle:
    task_id: str
    objective: str
    state: TaskState = TaskState.QUEUED
    current_step: str = ""
    progress: int = 0
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    updated_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    retry_count: int = 0
    cancellation_requested: bool = False
    error_code: Optional[str] = None
    error_details: Optional[str] = None
    verification_evidence: list[dict[str, Any]] = field(default_factory=list)
    timeline: list[dict[str, Any]] = field(default_factory=list)
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    def __post_init__(self) -> None:
        self._record_event("state", "Task queued", state=self.state.value)

    def _record_event(self, event: str, details: str, **extra: Any) -> None:
        self.timeline.append({
            "timestamp": time.time(),
            "event": event,
            "details": str(details)[:1000],
            **extra,
        })

    def transition(
        self,
        new_state: TaskState | str,
        *,
        current_step: Optional[str] = None,
        error_code: Optional[str] = None,
        error_details: Optional[str] = None,
    ) -> None:
        target = TaskState(new_state)
        with self._lock:
            if target == self.state:
                if current_step is not None:
                    self.current_step = current_step
                self.updated_at = time.time()
                self._record_event("state", current_step or f"Task remains {target.value}", state=target.value)
                return
            if target not in VALID_TRANSITIONS[self.state]:
                raise InvalidTaskTransition(f"Cannot transition task from {self.state.value} to {target.value}")
            now = time.time()
            self.state = target
            self.updated_at = now
            if target == TaskState.RUNNING and self.started_at is None:
                self.started_at = now
            if current_step is not None:
                self.current_step = current_step
            if target == TaskState.CANCELLED:
                self.cancellation_requested = True
            if target == TaskState.FAILED:
                self.error_code = error_code or "task_failed"
                self.error_details = error_details or "Task execution failed."
            if target in TERMINAL_STATES:
                self.completed_at = now
                self.progress = 100 if target == TaskState.SUCCESS else self.progress
            self._record_event(
                "state",
                current_step or f"Task transitioned to {target.value}",
                state=target.value,
                error_code=self.error_code,
            )

    def set_progress(self, progress: int, current_step: Optional[str] = None) -> None:
        with self._lock:
            if self.state in TERMINAL_STATES:
                raise InvalidTaskTransition("Cannot update a terminal task")
            self.progress = max(0, min(int(progress), 99))
            if current_step is not None:
                self.current_step = current_step
            self.updated_at = time.time()
            self._record_event("progress", current_step or "Progress updated", progress=self.progress)

    def add_evidence(self, evidence: dict[str, Any]) -> None:
        with self._lock:
            self.verification_evidence.append(evidence)
            self.updated_at = time.time()
            self._record_event("verification", str(evidence.get("details") or evidence.get("type") or "Evidence recorded"))

    def record_retry(self, details: str) -> None:
        with self._lock:
            if self.state in TERMINAL_STATES:
                raise InvalidTaskTransition("Cannot retry a terminal task")
            self.retry_count += 1
            self.updated_at = time.time()
            self._record_event("retry", details, retry_count=self.retry_count)

    def request_cancellation(self, details: str = "Cancellation requested") -> None:
        with self._lock:
            if self.state in TERMINAL_STATES:
                raise InvalidTaskTransition("Cannot cancel a terminal task")
            self.cancellation_requested = True
            self.updated_at = time.time()
            self._record_event("cancellation_requested", details, state=self.state.value)

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "objective": self.objective,
            "state": self.state.value,
            "current_step": self.current_step,
            "progress": self.progress,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
            "retry_count": self.retry_count,
            "cancellation_requested": self.cancellation_requested,
            "error_code": self.error_code,
            "error_details": self.error_details,
            "verification_evidence": list(self.verification_evidence),
            "timeline": list(self.timeline),
        }


def initialize_task_record(task_id: str, objective: str, **extra: Any) -> dict[str, Any]:
    lifecycle = TaskLifecycle(task_id=task_id, objective=objective)
    return {**extra, **lifecycle.to_dict(), "active": True, "_lifecycle": lifecycle}


def transition_task_record(
    record: dict[str, Any],
    state: TaskState | str,
    *,
    current_step: Optional[str] = None,
    error_code: Optional[str] = None,
    error_details: Optional[str] = None,
) -> None:
    lifecycle = record.get("_lifecycle")
    if not isinstance(lifecycle, TaskLifecycle):
        lifecycle = TaskLifecycle(
            task_id=str(record.get("task_id", "unknown")),
            objective=str(record.get("objective") or record.get("condition") or "Automation task"),
        )
        if record.get("active", True):
            lifecycle.transition(TaskState.RUNNING)
        record["_lifecycle"] = lifecycle
    lifecycle.transition(
        state,
        current_step=current_step,
        error_code=error_code,
        error_details=error_details,
    )
    record.update(lifecycle.to_dict())
    record["active"] = lifecycle.state not in TERMINAL_STATES


def public_task_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if not key.startswith("_")}
