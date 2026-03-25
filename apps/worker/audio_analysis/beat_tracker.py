"""
Beat tracker module — uses madmom's RNN-based beat tracking.

madmom requires WAV input (not MP3). Always convert to WAV with FFmpeg
before calling this module. The conversion is handled by the pipeline
orchestrator, but an assertion guards against accidental MP3 input.

References:
    Böck, S. and Schedl, M. (2011) "Enhanced Beat Tracking with Context-Aware
    Neural Networks", Proc. DAFx.
"""

from __future__ import annotations

import logging
import os
from typing import TypedDict

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class BeatEvent(TypedDict):
    """Single beat event with time and strength.

    Attributes:
        time_ms: Beat time in milliseconds.
        strength: Beat confidence/strength (0.0–1.0).
    """

    time_ms: float
    strength: float


def track_beats(wav_path: str) -> tuple[list[BeatEvent], float]:
    """Detect beats in a WAV audio file using madmom's RNN beat tracker.

    The RNNBeatProcessor computes beat activation function with a recurrent
    neural network; BeatTrackingProcessor runs dynamic programming to find
    the most likely beat sequence.

    Args:
        wav_path: Absolute path to a WAV file (MP3 not supported by madmom).

    Returns:
        Tuple of:
          - list of BeatEvent dicts (time_ms, strength)
          - estimated tempo in BPM (float)

    Raises:
        ValueError: If wav_path does not end with .wav.
        FileNotFoundError: If the file does not exist.
    """
    if not wav_path.lower().endswith(".wav"):
        raise ValueError(
            f"madmom requires WAV input but received: {wav_path}. "
            "Convert to WAV with FFmpeg first."
        )
    if not os.path.isfile(wav_path):
        raise FileNotFoundError(f"WAV file not found: {wav_path}")

    logger.info("Beat tracking: %s", wav_path)

    try:
        from madmom.features.beats import RNNBeatProcessor, BeatTrackingProcessor

        # Compute beat activation function
        proc = RNNBeatProcessor()
        act = proc(wav_path)

        # Dynamic programming beat tracking
        beat_tracker = BeatTrackingProcessor(fps=100)
        beat_times: NDArray[np.float64] = beat_tracker(act)

    except ImportError:
        logger.warning(
            "madmom not available — falling back to librosa beat tracking"
        )
        beat_times = _librosa_fallback_beats(wav_path)

    if len(beat_times) == 0:
        logger.warning("No beats detected in %s", wav_path)
        return [], 0.0

    # Compute inter-beat intervals to estimate BPM
    ibi_seconds = np.diff(beat_times)
    median_ibi = float(np.median(ibi_seconds)) if len(ibi_seconds) > 0 else 0.5
    bpm = 60.0 / median_ibi if median_ibi > 0 else 0.0

    # Compute per-beat strength from beat activation if available, else uniform
    strengths = _compute_beat_strengths(beat_times)

    events: list[BeatEvent] = [
        {"time_ms": float(t * 1000.0), "strength": float(s)}
        for t, s in zip(beat_times, strengths)
    ]

    logger.info(
        "Detected %d beats, tempo=%.1f BPM in %s",
        len(events),
        bpm,
        wav_path,
    )
    return events, bpm


def _compute_beat_strengths(
    beat_times: NDArray[np.float64],
) -> NDArray[np.float64]:
    """Assign a strength value to each beat based on metrical position.

    Downbeats (every 4th beat) get strength 1.0, other beats are scaled
    proportionally. In the absence of time-signature detection, 4/4 is assumed.

    Args:
        beat_times: Array of beat times in seconds, shape (n_beats,).

    Returns:
        Strength array in [0.5, 1.0], shape (n_beats,).
    """
    n = len(beat_times)
    strengths = np.full(n, 0.7, dtype=np.float64)
    # Downbeat every 4 beats → strength 1.0
    strengths[::4] = 1.0
    # Upbeat (beat 3 in 4/4) → strength 0.85
    strengths[2::4] = 0.85
    return strengths


def _librosa_fallback_beats(wav_path: str) -> NDArray[np.float64]:
    """Fallback beat detection using librosa when madmom is unavailable.

    Args:
        wav_path: Path to WAV file.

    Returns:
        Beat times in seconds, shape (n_beats,).
    """
    import librosa  # type: ignore[import]

    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times: NDArray[np.float64] = librosa.frames_to_time(beat_frames, sr=sr)
    return beat_times
