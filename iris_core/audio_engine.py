"""
AudioEngine Stub: Disabled audio input.
"""

class AudioEngine:
    def __init__(self, models_dir=None):
        self.is_running = False

    def register_callback(self, callback):
        pass

    def unregister_callback(self, callback):
        pass

    def start(self) -> bool:
        return False

    def stop(self):
        pass

    def get_status(self) -> dict:
        return {
            "running": False,
            "initialized": False,
            "engine": "disabled",
            "device": "disabled"
        }

audio_engine = AudioEngine()
