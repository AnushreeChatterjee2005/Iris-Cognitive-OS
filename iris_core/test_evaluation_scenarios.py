import json
from pathlib import Path

import main
import watcher
import workflow_engine


SCENARIOS = json.loads(
    (Path(__file__).resolve().parents[1] / "evaluation" / "scenarios.json").read_text(encoding="utf-8")
)


def test_evaluation_planner_scenarios_are_deterministic():
    for scenario in SCENARIOS["planner_scenarios"]:
        steps = workflow_engine.decompose_command_heuristic(scenario["command"])
        assert [step["action"] for step in steps] == scenario["expected_actions"], scenario["id"]


def test_evaluation_routing_scenarios_are_enforced():
    scenarios = {scenario["id"]: scenario for scenario in SCENARIOS["routing_scenarios"]}
    assert main.is_background_task(scenarios["parallel-research"]["command"])
    assert main.command_requires_confirmation(scenarios["sensitive-confirmation"]["command"])


def test_evaluation_visual_trigger_contract_is_deterministic():
    scenario = SCENARIOS["watch_scenarios"][0]
    condition, action = watcher._split_visual_command(scenario["command"], "")
    assert condition == scenario["expected_condition"]
    assert action == scenario["expected_action"]
