"""
Onset detector module — librosa onset detection with peak picking.

Detects note attacks and transient events. Onsets are denser than beats and
are used for triggering fine-grained valve effects (e.g., mist bursts on hi-hat
transients).
"""

from __future__ import annotations

import logging
from typing import TypedDict

import librosa  # type: ignore[import]
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class OnsetEvent(TypedDict):
    """Single onset (transient) event.

    Attributes:
        time_ms: Onset time in milliseconds.
        strength: Onset strength / salience (0.0–1.0).
    """

    time_ms: float
    strength: float


def detect_onsets(
    audio: NDArray[np.float32],
    sample_rate: int,
    hop_length: int = 512,
    delta: float = 0.07,
    wait: int = 1,
    pre_avg: int = 3,
    post_avg: int = 3,
    pre_max: int = 3,
    post_max: int = 3,
) -> list[OnsetEvent]:
    """Detect onsets (note attacks/transients) in a mono audio signal.

    Uses librosa's onset strength envelope followed by peak-picking. The
    parameters control sensitivity and minimum separation between onsets.

    Args:
        audio: Mono audio signal, shape (n_samples,).
        sample_rate: Sample rate in Hz.
        hop_length: STFT hop length in samples (default 512 → ~43 fps at 22050 Hz).
        delta: Threshold above the onset envelope mean for peak detection.
        wait: Minimum number of frames between onsets.
        pre_avg: Frames before onset for computing local average.
        post_avg: Frames after onset for computing local average.
        pre_max: Frames before onset for computing local maximum.
        post_max: Frames after onset for computing local maximum.

    Returns:
        List of OnsetEvent dicts sorted by time, strengths normalised to [0, 1].
    """
    logger.info(
        "Detecting onsets: sr=%d, hop=%d, delta=%.3f, samples=%d",
        sample_rate,
        hop_length,
        delta,
        len(audio),
    )

    # Compute onset strength envelope
    onset_env: NDArray[np.float32] = librosa.onset.onset_strength(
        y=audio, sr=sample_rate, hop_length=hop_length
    ).astype(np.float32)

    # Peak-pick the onset envelope
    onset_frames: NDArray[np.intp] = librosa.onset.onset_detect(
        onset_envelope=onset_env,
        sr=sample_rate,
        hop_length=hop_length,
        delta=delta,
        wait=wait,
        pre_avg=pre_avg,
        post_avg=post_avg,
        pre_max=pre_max,
        post_max=post_max,
        units="frames",
    )

    onset_times_s: NDArray[np.float32] = librosa.frames_to_time(
        onset_frames, sr=sample_rate, hop_length=hop_length
    ).astype(np.float32)

    # Normalise strengths to [0, 1]
    strengths = onset_env[np.clip(onset_frames, 0, len(onset_env) - 1)]
    peak_strength = float(np.max(strengths)) if len(strengths) > 0 else 1.0
    if peak_strength > 0.0:
        strengths = strengths / peak_strength

    events: list[OnsetEvent] = [
        {"time_ms": float(t * 1000.0), "strength": float(s)}
        for t, s in zip(onset_times_s, strengths)
    ]

    logger.info("Detected %d onsets", len(events))
    return events
