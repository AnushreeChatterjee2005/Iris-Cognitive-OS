import os

import pytest

from parallel_desktop_engine import ParallelTask, parallel_engine


@pytest.mark.parametrize("format_type", ["txt", "docx", "pdf"])
def test_parallel_export_writes_and_verifies_requested_format(monkeypatch, tmp_path, format_type):
    monkeypatch.setenv("IRIS_EXPORT_DIR", str(tmp_path))
    task = ParallelTask(f"export-{format_type}", "Evaluate IRIS export")
    task.results["summary"] = "Verified research marker with evidence [1](https://example.test/source)."
    parallel_engine.active_tasks[task.task_id] = task
    try:
        result = parallel_engine.export_dossier(task.task_id, format_type)
    finally:
        parallel_engine.active_tasks.pop(task.task_id, None)

    assert result["status"] == "success"
    assert os.path.commonpath([str(tmp_path), result["path"]]) == str(tmp_path)
    assert os.path.isfile(result["path"])
    assert os.path.getsize(result["path"]) > 0


def test_bring_to_desktop_reports_when_nothing_can_be_transferred(monkeypatch, tmp_path):
    monkeypatch.setenv("IRIS_EXPORT_DIR", str(tmp_path))
    task = ParallelTask("empty-transfer", "No output")
    parallel_engine.active_tasks[task.task_id] = task
    try:
        result = parallel_engine.bring_to_desktop(task.task_id, "files")
    finally:
        parallel_engine.active_tasks.pop(task.task_id, None)

    assert result["status"] == "error"
    assert result["items"] == []
