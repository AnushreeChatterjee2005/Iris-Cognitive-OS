import pytest

import watcher


def test_visual_command_separates_observation_from_action():
    condition, action = watcher._split_visual_command(
        "when you see Download complete, then open the file",
        "",
    )
    assert condition == "Download complete"
    assert action == "open the file"


def test_visual_command_requires_an_explicit_action():
    with pytest.raises(ValueError, match="requires an explicit action"):
        watcher._split_visual_command("download complete", "")
