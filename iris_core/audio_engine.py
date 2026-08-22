import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Optional
from dotenv import load_dotenv

# Load environment variables for GROQ_API_KEY
base_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(base_dir, "..", ".env"), override=True)
load_dotenv()

try:
    import speech_recognition as sr
except ImportError:
    sr = None


class AudioEngine:
    """
    High-Performance Speech Recognition & Voice Activity Engine for IRIS.
    Tier 1: Groq Cloud Whisper Large V3 Turbo (~150ms latency, high accuracy)
    Tier 2: Google Web Speech Recognition (zero setup, robust instant fallback)
    """

    # Common Whisper / ASR hallucinations on background silence
    HALLUCINATIONS = {
        "thank you.", "thank you", "thanks.", "thanks", "thank you very much.",
        "thanks for watching.", "thanks for watching", "thank you for watching.",
        "subtitles by", "amara.org", "you", "bye.", "bye", "mbc", "subtitles",
        ".", "..", "...", "so", "the end", "okay.", "okay"
    }

    def __init__(self, models_dir: Optional[str] = None):
        self.models_dir = models_dir or os.path.join(base_dir, "models")
        self.is_running = False
        self._stopper: Optional[Callable[[bool], None]] = None
        self._executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="iris_stt")
        self._callbacks: list[Callable[[str], None]] = []
        self._lock = threading.Lock()
        self._recognizer: Optional[sr.Recognizer] = None
        self._mic: Optional[sr.Microphone] = None
        self.groq_api_key = os.environ.get("GROQ_API_KEY", "").strip()

    def register_callback(self, callback: Callable[[str], None]):
        """Register a callback function to receive recognized speech text."""
        if callback not in self._callbacks:
            self._callbacks.append(callback)

    def unregister_callback(self, callback: Callable[[str], None]):
        """Unregister a previously registered callback function."""
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def _init_speech_recognition(self) -> bool:
        """Initializes speech_recognition Recognizer and Microphone with optimized settings."""
        if sr is None:
            print("[AudioEngine] Error: speech_recognition module is not installed.")
            return False

        try:
            self.groq_api_key = os.environ.get("GROQ_API_KEY", "").strip()
            self._recognizer = sr.Recognizer()
            self._mic = sr.Microphone()

            # Responsive parameters
            self._recognizer.energy_threshold = 150
            self._recognizer.dynamic_energy_threshold = True
            self._recognizer.dynamic_energy_adjustment_damping = 0.15
            self._recognizer.dynamic_energy_ratio = 1.4
            self._recognizer.pause_threshold = 0.5          # 500ms silence ends phrase for fast response
            self._recognizer.phrase_threshold = 0.15        # 150ms minimum speech onset
            self._recognizer.non_speaking_duration = 0.3

            # Calibrate ambient noise quickly (300ms)
            try:
                with self._mic as source:
                    self._recognizer.adjust_for_ambient_noise(source, duration=0.3)
                # Keep energy threshold in a responsive range
                self._recognizer.energy_threshold = max(60, min(self._recognizer.energy_threshold, 350))
                print(f"[AudioEngine] Calibrated microphone ambient threshold: {self._recognizer.energy_threshold:.1f}")
            except Exception as ne:
                print(f"[AudioEngine] Ambient calibration note: {ne}")

            return True
        except Exception as e:
            print(f"[AudioEngine] Failed to initialize microphone: {e}")
            return False

    def _is_hallucination(self, text: str) -> bool:
        """Detects and suppresses common silence artifacts from Whisper."""
        cleaned = text.strip().lower()
        if not cleaned or len(cleaned) <= 1:
            return True
        if cleaned in self.HALLUCINATIONS:
            return True
        if any(h in cleaned for h in ["subtitles by", "translated by", "amara.org", "community subtitles"]):
            return True
        return False

    def _transcribe_audio_chunk(self, audio: sr.AudioData):
        """Asynchronously transcribes an audio chunk using Groq Whisper -> Google Speech fallback."""
        if not audio or not self.is_running:
            return

        text = None
        engine_used = None

        # 1. Primary: Groq Whisper Large V3 Turbo (near-instant ~150ms)
        if self.groq_api_key:
            try:
                os.environ["GROQ_API_KEY"] = self.groq_api_key
                text = self._recognizer.recognize_groq(
                    audio,
                    model="whisper-large-v3-turbo"
                )
                engine_used = "Groq Whisper"
            except sr.UnknownValueError:
                return
            except Exception as ge:
                print(f"[AudioEngine] Groq STT note: {ge}. Falling back to Google...")

        # 2. Fallback: Google Web Speech Recognition
        if not text:
            try:
                text = self._recognizer.recognize_google(audio)
                engine_used = "Google Speech"
            except sr.UnknownValueError:
                return
            except Exception as goe:
                print(f"[AudioEngine] Google STT note: {goe}")
                return

        if text:
            text = text.strip()
            if self._is_hallucination(text):
                return

            print(f"[AudioEngine] Transcribed ({engine_used}): \"{text}\"")
            for cb in list(self._callbacks):
                try:
                    cb(text)
                except Exception as cbe:
                    print(f"[AudioEngine] Callback dispatch error: {cbe}")

    def _on_audio_captured(self, recognizer: sr.Recognizer, audio: sr.AudioData):
        """Callback invoked whenever a phrase is captured by the background listener."""
        if self.is_running:
            self._executor.submit(self._transcribe_audio_chunk, audio)

    def start(self) -> bool:
        """Starts microphone recording and transcription in background."""
        with self._lock:
            if self.is_running:
                return True

            success = self._init_speech_recognition()
            if not success:
                return False

            self.is_running = True
            try:
                self._stopper = self._recognizer.listen_in_background(
                    self._mic,
                    self._on_audio_captured,
                    phrase_time_limit=15
                )
                active_model = "Groq Whisper Large V3 Turbo" if self.groq_api_key else "Google Web Speech"
                print(f"[AudioEngine] Microphone active (Engine: {active_model}).")
                return True
            except Exception as e:
                print(f"[AudioEngine] Failed to start background listener: {e}")
                self.is_running = False
                return False

    def stop(self):
        """Stops the audio stream and background listener immediately."""
        with self._lock:
            if not self.is_running:
                return

            self.is_running = False
            if self._stopper:
                try:
                    self._stopper(wait_for_stop=False)
                except Exception as e:
                    print(f"[AudioEngine] Stopper note: {e}")
                self._stopper = None

            print("[AudioEngine] Microphone stopped.")

    def get_status(self) -> dict:
        """Returns the current state and device information of the audio engine."""
        device_name = "Default System Microphone"
        try:
            if sr is not None:
                names = sr.Microphone.list_microphone_names()
                if names:
                    device_name = names[0]
        except Exception:
            pass

        return {
            "running": self.is_running,
            "initialized": self._recognizer is not None,
            "engine": "groq-whisper-turbo" if self.groq_api_key else "google-speech",
            "device": device_name
        }


# Singleton instance
audio_engine = AudioEngine()
