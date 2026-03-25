"""
Song boundary detector — finds boundaries between songs in a stitched file.

Algorithm (from CLAUDE.md §5.3):
  1. Find regions where RMS energy is below 2% of mean energy for > 800ms.
  2. Require a significant spectral centroid shift across the boundary
     (ratio > 1.5 or < 0.67 between pre/post boundary mean centroid).
  3. Mark the boundary at the centre of the silence region.
  4. Between songs: note that the choreography engine will insert an intermission
     (centre jet at 10%, cool blue lighting).
"""

from __future__ import annotations

import logging
from typing import TypedDict

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Spectral centroid ratio threshold for confirming a new song starts
_CENTROID_RATIO_THRESHOLD = 1.4


class SongBoundary(TypedDict):
    """Detected boundary between songs in a stitched file.

    Attributes:
        time_ms: Time in milliseconds where the new song begins.
        silence_duration_ms: Duration of the silence gap in milliseconds.
    """

    time_ms: float
    silence_duration_ms: float


def detect_song_boundaries(
    rms_envelope: NDArray[np.float32],
    spectral_centroid: NDArray[np.float32],
    frame_rate: float,
    silence_energy_threshold_pct: float = 0.02,
    min_silence_duration_ms: float = 800.0,
) -> list[SongBoundary]:
    """Detect song boundaries in a stitched multi-song audio file.

    Args:
        rms_envelope: Per-frame RMS energy (normalised to [0, 1]), shape (n_frames,).
        spectral_centroid: Per-frame spectral centroid in Hz, shape (n_frames,).
        frame_rate: Analysis frame rate in Hz.
        silence_energy_threshold_pct: Energy below this fraction of mean is silence.
        min_silence_duration_ms: Minimum silence duration to be a boundary.

    Returns:
        List of SongBoundary dicts, sorted by time.
    """
    if len(rms_envelope) == 0:
        return []

    logger.info(
        "Detecting song boundaries: %d frames @ %.2f fps, silence_thresh=%.3f, min_silence_ms=%.0f",
        len(rms_envelope),
        frame_rate,
        silence_energy_threshold_pct,
        min_silence_duration_ms,
    )

    mean_energy = float(np.mean(rms_envelope))
    silence_threshold = mean_energy * silence_energy_threshold_pct
    min_silence_frames = int(min_silence_duration_ms / 1000.0 * frame_rate)

    # Build boolean silence mask
    is_silent: NDArray[np.bool_] = rms_envelope < silence_threshold

    # Find contiguous silence runs
    silence_runs = _find_contiguous_runs(is_silent)

    boundaries: list[SongBoundary] = []
    for run_start, run_end in silence_runs:
        run_length_frames = run_end - run_start
        if run_length_frames < min_silence_frames:
            continue

        silence_duration_ms = float(run_length_frames / frame_rate * 1000.0)
        boundary_frame = (run_start + run_end) // 2

        # Confirm with spectral centroid shift
        if not _has_centroid_shift(
            spectral_centroid,
            run_start,
            run_end,
            context_frames=int(frame_rate * 3),  # 3 seconds of context
        ):
            logger.debug(
                "Silence at frame %d–%d (%.0fms) rejected: no spectral centroid shift",
                run_start,
                run_end,
                silence_duration_ms,
            )
            continue

        boundary_time_ms = float(boundary_frame / frame_rate * 1000.0)
        boundaries.append(
            SongBoundary(
                time_ms=round(boundary_time_ms, 1),
                silence_duration_ms=round(silence_duration_ms, 1),
            )
        )
        logger.info(
            "Song boundary detected at %.0fms (silence=%.0fms)",
            boundary_time_ms,
            silence_duration_ms,
        )

    return sorted(boundaries, key=lambda b: b["time_ms"])


def _find_contiguous_runs(
    mask: NDArray[np.bool_],
) -> list[tuple[int, int]]:
    """Find contiguous True regions in a boolean mask.

    Args:
        mask: Boolean array, shape (n,).

    Returns:
        List of (start_inclusive, end_exclusive) tuples for each run.
    """
    if not np.any(mask):
        return []

    padded = np.concatenate([[False], mask, [False]])
    diff = np.diff(padded.astype(np.int8))
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    return list(zip(starts.tolist(), ends.tolist()))


def _has_centroid_shift(
    spectral_centroid: NDArray[np.float32],
    silence_start: int,
    silence_end: int,
    context_frames: int,
) -> bool:
    """Check whether spectral centroid shifts significantly around a silence gap.

    Args:
        spectral_centroid: Per-frame spectral centroid in Hz.
        silence_start: First frame of silence region.
        silence_end: Last frame (exclusive) of silence region.
        context_frames: How many frames before/after silence to compare.

    Returns:
        True if there is a significant centroid shift (ratio > threshold).
    """
    n = len(spectral_centroid)

    pre_start = max(0, silence_start - context_frames)
    pre_end = silence_start
    post_start = silence_end
    post_end = min(n, silence_end + context_frames)

    if pre_end <= pre_start or post_end <= post_start:
        return False

    pre_centroid = float(np.mean(spectral_centroid[pre_start:pre_end]))
    post_centroid = float(np.mean(spectral_centroid[post_start:post_end]))

    if pre_centroid <= 0.0 or post_centroid <= 0.0:
        return False

    ratio = post_centroid / pre_centroid
    shifted = ratio > _CENTROID_RATIO_THRESHOLD or ratio < (1.0 / _CENTROID_RATIO_THRESHOLD)

    logger.debug(
        "Centroid shift check: pre=%.1f Hz, post=%.1f Hz, ratio=%.2f, shifted=%s",
        pre_centroid,
        post_centroid,
        ratio,
        shifted,
    )
    return shifted
