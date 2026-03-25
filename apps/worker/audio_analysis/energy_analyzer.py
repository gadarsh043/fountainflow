"""
Energy analyzer module — RMS energy envelope computation.

Computes a per-frame RMS energy envelope normalized to [0, 1] relative to
the global peak energy. Also computes the spectral centroid, which is needed
by song_boundary.py for detecting timbral shifts across silence gaps.
"""

from __future__ import annotations

import logging
from typing import TypedDict

import librosa  # type: ignore[import]
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class EnergyEnvelope(TypedDict):
    """Per-frame energy envelope data.

    Attributes:
        frame_rate: Analysis frames per second.
        rms: Normalised RMS energy per frame, list length n_frames.
        spectral_centroid: Spectral centroid per frame in Hz.
    """

    frame_rate: float
    rms: list[float]
    spectral_centroid: list[float]


def compute_energy_envelope(
    audio: NDArray[np.float32],
    sample_rate: int,
    hop_length: int = 512,
    frame_length: int = 2048,
) -> EnergyEnvelope:
    """Compute RMS energy envelope and spectral centroid for an audio signal.

    Args:
        audio: Mono audio signal, shape (n_samples,).
        sample_rate: Sample rate in Hz (should be 22050).
        hop_length: Analysis hop size in samples (default 512).
        frame_length: Frame length for RMS computation (default 2048).

    Returns:
        EnergyEnvelope dict with frame_rate, rms, and spectral_centroid.
    """
    logger.info(
        "Computing energy envelope: sr=%d, hop=%d, samples=%d",
        sample_rate,
        hop_length,
        len(audio),
    )

    # RMS energy per frame
    rms_raw: NDArray[np.float32] = librosa.feature.rms(
        y=audio, frame_length=frame_length, hop_length=hop_length
    )[0].astype(np.float32)

    # Normalise to [0, 1]
    peak_rms = float(np.max(rms_raw))
    if peak_rms > 0.0:
        rms_normalised = (rms_raw / peak_rms).clip(0.0, 1.0)
    else:
        rms_normalised = rms_raw

    # Spectral centroid per frame (in Hz)
    centroid: NDArray[np.float32] = librosa.feature.spectral_centroid(
        y=audio, sr=sample_rate, hop_length=hop_length
    )[0].astype(np.float32)

    # Align length — librosa RMS and centroid sometimes differ by 1 frame
    min_len = min(len(rms_normalised), len(centroid))
    rms_normalised = rms_normalised[:min_len]
    centroid = centroid[:min_len]

    frame_rate = float(sample_rate) / float(hop_length)

    logger.info(
        "Energy envelope: %d frames, frame_rate=%.2f fps, peak_rms=%.4f",
        len(rms_normalised),
        frame_rate,
        peak_rms,
    )

    return EnergyEnvelope(
        frame_rate=round(frame_rate, 4),
        rms=rms_normalised.tolist(),
        spectral_centroid=centroid.tolist(),
    )


def compute_mean_energy_in_region(
    rms: NDArray[np.float32],
    frame_rate: float,
    start_s: float,
    end_s: float,
) -> float:
    """Compute mean RMS energy in a time region.

    Args:
        rms: Normalised RMS energy array, shape (n_frames,).
        frame_rate: Frames per second.
        start_s: Region start in seconds.
        end_s: Region end in seconds.

    Returns:
        Mean energy in [0, 1] for the specified region.
    """
    start_frame = max(0, int(start_s * frame_rate))
    end_frame = min(len(rms), int(end_s * frame_rate))
    if end_frame <= start_frame:
        return 0.0
    return float(np.mean(rms[start_frame:end_frame]))
