import workflow_engine


def test_local_planner_includes_explicit_save_step_and_excludes_save_words_from_content():
    steps = workflow_engine.decompose_command_heuristic("open notepad and type Hackathon demo ready and save it")
    assert [step["action"] for step in steps] == ["open", "type", "save"]
    assert steps[1]["content"] == "Hackathon demo ready"
