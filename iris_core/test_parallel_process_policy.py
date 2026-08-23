from parallel_desktop_engine import parallel_engine


def test_parallel_launcher_rejects_unapproved_executable_before_os_launch():
    original_initialized = parallel_engine.desktop_initialized
    original_desktop = parallel_engine.hdesk
    parallel_engine.desktop_initialized = True
    parallel_engine.hdesk = object()
    try:
        assert parallel_engine.launch_process_in_desktop("powershell.exe") is None
    finally:
        parallel_engine.desktop_initialized = original_initialized
        parallel_engine.hdesk = original_desktop


def test_parallel_launcher_rejects_non_http_browser_argument_before_os_launch():
    original_initialized = parallel_engine.desktop_initialized
    original_desktop = parallel_engine.hdesk
    parallel_engine.desktop_initialized = True
    parallel_engine.hdesk = object()
    try:
        assert parallel_engine.launch_process_in_desktop("chrome", "file:///C:/secret.txt") is None
    finally:
        parallel_engine.desktop_initialized = original_initialized
        parallel_engine.hdesk = original_desktop
