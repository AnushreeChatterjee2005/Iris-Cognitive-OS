import threading
import pytest

from browser_automation import (
    ActionResult,
    BrowserAction,
    BrowserAutomationLoop,
    BrowserLoopConfig,
    BrowserObservation,
    SuccessCriteria,
    PlaywrightCDPAdapter,
)


def test_cdp_adapter_rejects_non_loopback_configuration():
    with pytest.raises(ValueError, match="loopback"):
        PlaywrightCDPAdapter("https://remote.example.test:9222")


def observation(text="Start", url="https://example.test", scroll=0, height=2000, dom_hash="a", loading=False):
    return BrowserObservation(url, "Example", text, scroll, 800, height, dom_hash, dom_hash, loading)


class SequenceAdapter:
    def __init__(self, observations, dom_success=True, accessibility_success=False, vision_success=False):
        self.observations = list(observations)
        self.index = 0
        self.dom_success = dom_success
        self.accessibility_success = accessibility_success
        self.vision_success = vision_success
        self.calls = []

    def capture(self):
        result = self.observations[min(self.index, len(self.observations) - 1)]
        if self.index < len(self.observations) - 1:
            self.index += 1
        return result

    def act_dom(self, action, _timeout):
        self.calls.append("dom")
        return ActionResult(self.dom_success, "dom", "dom result")

    def act_accessibility(self, action, _timeout):
        self.calls.append("accessibility")
        return ActionResult(self.accessibility_success, "accessibility", "accessibility result")

    def act_vision(self, action, _timeout):
        self.calls.append("vision")
        return ActionResult(self.vision_success, "vision", "vision result")


class FixedPlanner:
    def __init__(self, action):
        self.action = action

    def next_action(self, _objective, _observation, _history):
        return self.action


def test_loop_verifies_page_after_dom_action():
    adapter = SequenceAdapter([
        observation(),
        observation(text="Checkout complete", dom_hash="b"),
        observation(text="Checkout complete", dom_hash="b"),
    ])
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("click", target="Buy")))
    outcome = loop.run("Complete checkout", SuccessCriteria(expected_text="Checkout complete"))

    assert outcome.state == "success"
    assert adapter.calls == ["dom"]
    assert outcome.evidence == ["Page contains 'Checkout complete'"]


def test_dom_failure_uses_accessibility_before_vision():
    adapter = SequenceAdapter(
        [observation(), observation(text="Playing", dom_hash="b"), observation(text="Playing", dom_hash="b")],
        dom_success=False,
        accessibility_success=True,
        vision_success=True,
    )
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("click", target="Play")))
    outcome = loop.run("Play media", SuccessCriteria(expected_text="Playing"))

    assert outcome.state == "success"
    assert adapter.calls == ["dom", "accessibility"]


def test_repeated_state_stops_infinite_loop():
    unchanged = observation()
    adapter = SequenceAdapter([unchanged], dom_success=True)
    config = BrowserLoopConfig(repeated_state_limit=2, max_retries_per_action=0)
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("wait", amount=100)), config)
    outcome = loop.run("Find missing text", SuccessCriteria(expected_text="Never present"))

    assert outcome.state == "failed"
    assert "Repeated browser state" in outcome.reason


def test_scroll_at_end_of_page_has_explicit_failure_reason():
    end = observation(scroll=1200, height=2000)
    adapter = SequenceAdapter([end], dom_success=True)
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("scroll", direction="down")))
    outcome = loop.run("Find result", SuccessCriteria(expected_text="Missing"))

    assert outcome.state == "failed"
    assert "end of the page" in outcome.reason


def test_cancellation_stops_before_any_action():
    adapter = SequenceAdapter([observation()])
    cancel = threading.Event()
    cancel.set()
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("click", target="Anything")))
    outcome = loop.run("Do something", SuccessCriteria(expected_text="Done"), cancel)

    assert outcome.state == "cancelled"
    assert adapter.calls == []


def test_planner_cannot_claim_success_without_verification():
    adapter = SequenceAdapter([observation()])
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("complete")))
    outcome = loop.run("Finish", SuccessCriteria(expected_text="Verified marker"))

    assert outcome.state == "failed"
    assert "before success criteria" in outcome.reason


def test_total_timeout_stops_before_capture_or_action():
    adapter = SequenceAdapter([observation()])
    loop = BrowserAutomationLoop(
        adapter,
        FixedPlanner(BrowserAction("click", target="Anything")),
        BrowserLoopConfig(total_timeout_seconds=0),
    )
    outcome = loop.run("Do something", SuccessCriteria(expected_text="Done"))
    assert outcome.state == "failed"
    assert "timeout" in outcome.reason.lower()
    assert adapter.index == 0
    assert adapter.calls == []


def test_loading_page_is_recaptured_before_planning(monkeypatch):
    monkeypatch.setattr("browser_automation.time.sleep", lambda _seconds: None)
    adapter = SequenceAdapter([
        observation(loading=True),
        observation(text="Ready", dom_hash="b"),
    ])
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("complete")))
    outcome = loop.run("Wait for ready", SuccessCriteria(expected_text="Ready"))
    assert outcome.state == "success"
    assert outcome.timeline[0]["loading_retries"] == 1


class RetryAdapter(SequenceAdapter):
    def __init__(self):
        super().__init__([
            observation(),
            observation(text="Done", dom_hash="changed"),
            observation(text="Done", dom_hash="changed"),
        ])
        self.dom_attempts = 0

    def act_dom(self, action, _timeout):
        self.calls.append("dom")
        self.dom_attempts += 1
        return ActionResult(self.dom_attempts >= 2, "dom", "retry result")

    def act_accessibility(self, action, _timeout):
        self.calls.append("accessibility")
        return ActionResult(False, "accessibility", "not found")

    def act_vision(self, action, _timeout):
        self.calls.append("vision")
        return ActionResult(False, "vision", "not found")


def test_failed_targeting_retries_then_verifies_changed_page():
    adapter = RetryAdapter()
    loop = BrowserAutomationLoop(adapter, FixedPlanner(BrowserAction("click", target="Continue")))
    outcome = loop.run("Continue", SuccessCriteria(expected_text="Done"))
    assert outcome.state == "success"
    assert outcome.retries == 1
    assert adapter.calls == ["dom", "accessibility", "vision", "dom"]
