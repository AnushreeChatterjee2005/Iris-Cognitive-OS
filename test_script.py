import sys
sys.path.append(r"c:\Users\Anushree Chatterjee\Hackathon_IRIS\iris_core")
import watcher

# Simulating the UI bounding boxes based on the screenshots
source_bbox = {"x": 100, "y": 100, "w": 200, "h": 50}
target_bbox = {"x": 500, "y": 500, "w": 200, "h": 50}
condition = "when you see ollama then type yayy"
action_text = ""
mode = "when"

# We can run it in a thread or just call it directly with a small tweak to active_watchers
task_id = "test_task"
watcher.active_watchers[task_id] = {"active": True, "status": "watching"}

try:
    watcher.watch_loop_full(task_id, source_bbox, target_bbox, condition, action_text, mode)
except KeyboardInterrupt:
    pass
