import pytest

from task_state import InvalidTaskTransition, TaskLifecycle, TaskState, initialize_task_record


def test_initialized_record_is_truthfully_queued_until_worker_starts():
    record = initialize_task_record("queued-task", "Wait for worker")
    assert record["state"] == "queued"
    assert record["started_at"] is None
    assert record["timeline"][0]["state"] == "queued"


def test_truthful_task_lifecycle_records_timestamps_and_failure_details():
    task = TaskLifecycle("task-1", "Play a song")
    task.transition(TaskState.RUNNING, current_step="Opening browser")
    task.set_progress(40, "Finding a result")
    task.transition(
        TaskState.FAILED,
        current_step="Playback verification failed",
        error_code="verification_failed",
        error_details="No pause control or moving progress bar was visible.",
    )

    record = task.to_dict()
    assert record["state"] == "failed"
    assert record["started_at"] is not None
    assert record["completed_at"] is not None
    assert record["error_code"] == "verification_failed"
    assert record["progress"] == 40


def test_terminal_task_cannot_return_to_running():
    task = TaskLifecycle("task-2", "Research a topic")
    task.transition(TaskState.RUNNING)
    task.transition(TaskState.SUCCESS)

    with pytest.raises(InvalidTaskTransition):
        task.transition(TaskState.RUNNING)


def test_waiting_task_can_resume_or_be_cancelled():
    task = TaskLifecycle("task-3", "Sensitive action")
    task.transition(TaskState.RUNNING)
    task.transition(TaskState.WAITING, current_step="Waiting for confirmation")
    task.transition(TaskState.CANCELLED, current_step="User declined")

    assert task.state == TaskState.CANCELLED
    assert task.cancellation_requested is True
