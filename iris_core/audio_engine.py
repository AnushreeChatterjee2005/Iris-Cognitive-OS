import os
import sys
import threading
import queue
import time
from typing import Callable, Optional
import numpy as np

try:
    import sherpa_onnx
    import sounddevice as sd
except ImportError:
    sherpa_onnx = None
    sd = None


class AudioEngine:
    """
    On-device Speech Recognition & Voice Activity Detection Engine for IRIS
    Powered by Sherpa-ONNX, Qwen3-ASR (0.6B INT8), and Silero VAD.
    """
    def __init__(self, models_dir: Optional[str] = None):
        if models_dir is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            self.models_dir = os.path.join(base_dir, "models")
        else:
            self.models_dir = models_dir

        self.recognizer: Optional[sherpa_onnx.OfflineRecognizer] = None
        self.vad: Optional[sherpa_onnx.VoiceActivityDetector] = None
        self.is_running = False
        self._record_thread: Optional[threading.Thread] = None
        self._process_thread: Optional[threading.Thread] = None
        self._audio_queue: queue.Queue = queue.Queue()
        self._callbacks: list[Callable[[str], None]] = []
        self._initialized = False
        self._init_lock = threading.Lock()
        self.sample_rate = 16000

    def register_callback(self, callback: Callable[[str], None]):
        """Register a callback function to receive recognized speech text."""
        if callback not in self._callbacks:
            self._callbacks.append(callback)

    def unregister_callback(self, callback: Callable[[str], None]):
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def _ensure_models_loaded(self):
        """Initializes the Qwen3-ASR recognizer and Silero VAD."""
        with self._init_lock:
            if self._initialized:
                return

            qwen_dir = os.path.join(self.models_dir, "qwen3-asr")
            conv = os.path.join(qwen_dir, "conv_frontend.onnx")
            enc = os.path.join(qwen_dir, "encoder.int8.onnx")
            dec = os.path.join(qwen_dir, "decoder.int8.onnx")
            tok = os.path.join(qwen_dir, "tokenizer")
            vad_path = os.path.join(self.models_dir, "silero_vad.onnx")

            # Verify model files
            for p in [conv, enc, dec, tok]:
                if not os.path.exists(p):
                    raise FileNotFoundError(f"Missing Qwen3-ASR model component at {p}")

            if not os.path.exists(vad_path):
                raise FileNotFoundError(f"Missing Silero VAD model at {vad_path}")

            print("[AudioEngine] Loading Qwen3-ASR (0.6B INT8) recognizer...")
            self.recognizer = sherpa_onnx.OfflineRecognizer.from_qwen3_asr(
                conv_frontend=conv,
                encoder=enc,
                decoder=dec,
                tokenizer=tok,
                num_threads=4,
                sample_rate=self.sample_rate,
                feature_dim=128,
                decoding_method="greedy_search"
            )

            print("[AudioEngine] Loading Silero VAD...")
            vad_config = sherpa_onnx.VadModelConfig()
            vad_config.silero_vad.model = vad_path
            vad_config.silero_vad.threshold = 0.25            # Highly sensitive to catch speech onset
            vad_config.silero_vad.min_silence_duration = 0.35 # 350ms silence before endpointing
            vad_config.silero_vad.min_speech_duration = 0.15  # 150ms speech duration
            vad_config.silero_vad.max_speech_duration = 15.0  # 15s max utterance
            vad_config.sample_rate = self.sample_rate

            self.vad = sherpa_onnx.VoiceActivityDetector(vad_config, buffer_size_in_seconds=60)
            self._initialized = True
            print("[AudioEngine] Initialized successfully with Qwen3-ASR & Silero VAD.")

    def get_status(self) -> dict:
        """Returns the current state and device information of the audio engine."""
        device_info = {}
        try:
            if sd is not None:
                default_in = sd.default.device[0]
                devices = sd.query_devices()
                if 0 <= default_in < len(devices):
                    device_info = {
                        "name": devices[default_in].get("name", "Unknown"),
                        "index": default_in,
                        "default_samplerate": devices[default_in].get("default_samplerate", 16000)
                    }
        except Exception as e:
            device_info = {"error": str(e)}

        return {
            "running": self.is_running,
            "initialized": self._initialized,
            "model": "sherpa-onnx-qwen3-asr-0.6b-int8",
            "vad": "silero-vad",
            "device": device_info
        }

    def _record_worker(self):
        """Worker thread continuously reading raw PCM audio from microphone."""
        samples_per_read = int(0.05 * self.sample_rate)  # 50ms chunks (800 samples)
        try:
            with sd.InputStream(channels=1, dtype="float32", samplerate=self.sample_rate) as stream:
                while self.is_running:
                    samples, overflow = stream.read(samples_per_read)
                    if not self.is_running:
                        break
                    samples = samples.reshape(-1)
                    # Adaptive Gain / Pre-amplification for soft microphones
                    peak = float(np.max(np.abs(samples)))
                    if 0.0005 < peak < 0.08:
                        gain = min(8.0, 0.25 / (peak + 1e-5))
                        samples = np.clip(samples * gain, -1.0, 1.0)
                    self._audio_queue.put(np.copy(samples))
        except Exception as e:
            print(f"[AudioEngine] Recording stream error: {e}")

    def _process_worker(self):
        """Worker thread feeding audio into VAD and decoding utterances upon endpointing."""
        window_size = 512  # 32ms window @ 16kHz
        buffer = np.array([], dtype=np.float32)
        offset = 0
        started = False

        while self.is_running:
            try:
                samples = self._audio_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            buffer = np.concatenate([buffer, samples])

            while offset + window_size <= len(buffer):
                window = buffer[offset : offset + window_size]
                self.vad.accept_waveform(window)
                if not started and self.vad.is_speech_detected():
                    started = True
                offset += window_size

            if not started:
                # Keep rolling window of past 10 windows for speech onset context
                if len(buffer) > 10 * window_size:
                    excess = len(buffer) - 10 * window_size
                    offset = max(0, offset - excess)
                    buffer = buffer[-10 * window_size :]

            # Check if VAD has completed an utterance segment
            while not self.vad.empty():
                segment = self.vad.front
                samples_to_decode = segment.samples
                self.vad.pop()

                # Reset buffer and state for next utterance
                buffer = np.array([], dtype=np.float32)
                offset = 0
                started = False

                if len(samples_to_decode) > int(0.2 * self.sample_rate):
                    stream = self.recognizer.create_stream()
                    stream.accept_waveform(self.sample_rate, samples_to_decode)
                    self.recognizer.decode_stream(stream)
                    text = stream.result.text.strip()
                    if text:
                        print(f"[AudioEngine] Transcribed: \"{text}\"")
                        for cb in list(self._callbacks):
                            try:
                                cb(text)
                            except Exception as e:
                                print(f"[AudioEngine] Callback error: {e}")

    def start(self) -> bool:
        """Starts microphone recording and processing threads."""
        if self.is_running:
            return True

        if sd is None or sherpa_onnx is None:
            print("[AudioEngine] Error: sounddevice or sherpa_onnx not installed.")
            return False

        try:
            self._ensure_models_loaded()
        except Exception as e:
            print(f"[AudioEngine] Error loading models: {e}")
            return False

        self.is_running = True
        self._audio_queue = queue.Queue()

        # Reset VAD detector state
        try:
            self.vad.reset()
            while not self.vad.empty():
                self.vad.pop()
        except Exception:
            pass

        # Start background workers
        self._record_thread = threading.Thread(target=self._record_worker, daemon=True)
        self._process_thread = threading.Thread(target=self._process_worker, daemon=True)

        self._record_thread.start()
        self._process_thread.start()

        print("[AudioEngine] Microphone recording active (Local Qwen3-ASR + Silero VAD).")
        return True

    def stop(self):
        """Stops the audio stream and worker threads."""
        if not self.is_running:
            return

        self.is_running = False

        if self._record_thread and self._record_thread.is_alive():
            self._record_thread.join(timeout=1.0)
            self._record_thread = None

        if self._process_thread and self._process_thread.is_alive():
            self._process_thread.join(timeout=1.0)
            self._process_thread = None

        print("[AudioEngine] Microphone stopped.")


# Singleton instance
audio_engine = AudioEngine()
