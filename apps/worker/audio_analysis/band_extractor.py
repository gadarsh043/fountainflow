"""
Band extractor module — 6-band frequency energy decomposition using librosa STFT.

Computes per-frame energy for each of the six defined frequency bands. Values
are normalized to the global peak energy so they are in [0.0, 1.0].

Band definitions (from CLAUDE.md §5.2):
  sub_bass  :  20 –   60 Hz
  bass      :  60 –  250 Hz
  low_mid   : 250 –  500 Hz
  mid       : 500 – 2000 Hz
  high_mid  :2000 – 4000 Hz
  treble    :4000 –20000 Hz
"""

from __future__ import annotations

import logging
from typing import TypedDict

import librosa  # type: ignore[import]
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BAND_DEFINITIONS: dict[str, tuple[float, float]] = {
    "sub_bass": (20.0, 60.0),
    "bass": (60.0, 250.0),
    "low_mid": (250.0, 500.0),
    "mid": (500.0, 2000.0),
    "high_mid": (2000.0, 4000.0),
    "treble": (4000.0, 20000.0),
}

BAND_NOZZLE_MAPPING: dict[str, list[str]] = {
    "sub_bass": ["water_screen"],
    "bass": ["center_jet", "high_jets", "ring_fountains"],
    "low_mid": ["organ_fountains", "corner_jets"],
    "mid": ["peacock_tail", "rising_sun", "revolving"],
    "high_mid": ["butterfly", "moving_head"],
    "treble": ["mist_lines"],
}


class FrequencyBands(TypedDict):
    """Per-frame energy for each of the six frequency bands.

    All arrays have shape (n_frames,) and are normalized to [0.0, 1.0].
    """

    sub_bass: list[float]
    bass: list[float]
    low_mid: list[float]
    mid: list[float]
    high_mid: list[float]
    treble: list[float]


def extract_band_energy(
    spectrogram: NDArray[np.float32],
    frequencies: NDArray[np.float32],
    low_hz: float,
    high_hz: float,
) -> NDArray[np.float32]:
    """Extract mean power energy in a frequency band across all frames.

    Args:
        spectrogram: STFT magnitude spectrogram, shape (n_freq, n_frames).
        frequencies: Frequency bin centers in Hz, shape (n_freq,).
        low_hz: Lower frequency bound in Hz (inclusive).
        high_hz: Upper frequency bound in Hz (exclusive).

    Returns:
        Mean power energy per frame, shape (n_frames,), in linear scale.
    """
    mask: NDArray[np.bool_] = (frequencies >= low_hz) & (frequencies < high_hz)
    if not np.any(mask):
        return np.zeros(spectrogram.shape[1], dtype=np.float32)
    return np.mean(spectrogram[mask, :] ** 2, axis=0).astype(np.float32)


def extract_all_bands(
    audio: NDArray[np.float32],
    sample_rate: int,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> tuple[FrequencyBands, int]:
    """Compute 6-band frequency energy from a loaded audio signal.

    Runs a single STFT pass and slices into the six bands. Energy values
    are normalized per-band to their own peak, ensuring the full 0–1 dynamic
    range is used for each band regardless of mixing levels.

    Args:
        audio: Mono audio signal, shape (n_samples,).
        sample_rate: Sample rate in Hz (must be 22050).
        n_fft: FFT window size (default 2048).
        hop_length: STFT hop length in samples (default 512).

    Returns:
        Tuple of:
          - FrequencyBands dict with per-frame arrays.
          - frame_rate as integer (sr // hop_length truncated).
    """
    logger.info(
        "Extracting frequency bands: sr=%d, n_fft=%d, hop=%d, samples=%d",
        sample_rate,
        n_fft,
        hop_length,
        len(audio),
    )

    # Compute STFT magnitude
    stft: NDArray[np.complex64] = librosa.stft(
        audio, n_fft=n_fft, hop_length=hop_length
    )
    magnitude: NDArray[np.float32] = np.abs(stft).astype(np.float32)

    # Frequency bin centers
    frequencies: NDArray[np.float32] = librosa.fft_frequencies(
        sr=sample_rate, n_fft=n_fft
    ).astype(np.float32)

    bands: FrequencyBands = {}  # type: ignore[assignment]
    for band_name, (low_hz, high_hz) in BAND_DEFINITIONS.items():
        energy = extract_band_energy(magnitude, frequencies, low_hz, high_hz)
        # Normalize to [0, 1] per band
        peak = float(np.max(energy))
        if peak > 0.0:
            energy = energy / peak
        bands[band_name] = energy.tolist()  # type: ignore[literal-required]
        logger.debug(
            "Band %s: mean=%.4f peak=%.4f frames=%d",
            band_name,
            float(np.mean(energy)),
            1.0 if peak > 0 else 0.0,
            len(energy),
        )

    frame_rate = int(sample_rate // hop_length)
    return bands, frame_rate


def compute_spectral_centroid(
    audio: NDArray[np.float32],
    sample_rate: int,
    hop_length: int = 512,
) -> NDArray[np.float32]:
    """Compute the spectral centroid per frame.

    Used by song_boundary.py to detect significant timbral shifts across
    silence boundaries.

    Args:
        audio: Mono audio signal, shape (n_samples,).
        sample_rate: Sample rate in Hz.
        hop_length: STFT hop length in samples.

    Returns:
        Spectral centroid in Hz per frame, shape (n_frames,).
    """
    centroid: NDArray[np.float32] = librosa.feature.spectral_centroid(
        y=audio, sr=sample_rate, hop_length=hop_length
    )[0].astype(np.float32)
    return centroid
