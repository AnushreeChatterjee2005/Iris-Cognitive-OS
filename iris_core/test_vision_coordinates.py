from PIL import Image
import pytest

from vision_grounding import ScreenCapture, normalized_box_to_screen


@pytest.fixture
def virtual_capture():
    return ScreenCapture(
        image=Image.new("RGB", (3840, 1080)),
        left=-1920,
        top=0,
        width=3840,
        height=1080,
    )


def test_normalized_box_maps_to_negative_virtual_screen_origin(virtual_capture):
    result = normalized_box_to_screen({
        "found": True,
        "x_min": 0,
        "y_min": 100,
        "x_max": 250,
        "y_max": 300,
        "confidence": 0.9,
    }, virtual_capture)

    assert result is not None
    assert result["x"] == -1920
    assert result["width"] == 960
    assert result["center_x"] == -1440


def test_small_normalization_overflow_is_clamped(virtual_capture):
    result = normalized_box_to_screen({
        "found": True,
        "x_min": -20,
        "y_min": 900,
        "x_max": 120,
        "y_max": 1020,
        "confidence": 0.8,
    }, virtual_capture)

    assert result is not None
    assert result["x"] == -1920
    assert result["normalized_box"]["y_max"] == 1000


@pytest.mark.parametrize("payload", [
    {"found": False, "x_min": 1, "y_min": 1, "x_max": 2, "y_max": 2, "confidence": 1},
    {"found": True, "x_min": True, "y_min": 1, "x_max": 2, "y_max": 2, "confidence": 1},
    {"found": True, "x_min": float("nan"), "y_min": 1, "x_max": 2, "y_max": 2, "confidence": 1},
    {"found": True, "x_min": 500, "y_min": 100, "x_max": 400, "y_max": 200, "confidence": 1},
    {"found": True, "x_min": 100, "y_min": 100, "x_max": 101, "y_max": 101, "confidence": 1},
    {"found": True, "x_min": 100, "y_min": 100, "x_max": 300, "y_max": 300, "confidence": 0.2},
    {"found": True, "x_min": -500, "y_min": 100, "x_max": 300, "y_max": 300, "confidence": 0.9},
])
def test_invalid_or_not_found_boxes_are_rejected(virtual_capture, payload):
    assert normalized_box_to_screen(payload, virtual_capture) is None
