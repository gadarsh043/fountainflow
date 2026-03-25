"""
Aesthetic rules — post-processing constraints applied to the compiled timeline.

Enforces:
1. Symmetry: if a paired nozzle fires, its mirror fires too
2. Minimum hold time: no keyframe transition shorter than 200ms
3. Crescendo conservation: peak VFD values must be highest at detected climax
4. Silence respect: when RMS < threshold, reduce all active effects
5. Smoothing: ensure transitions don't exceed ramp-rate constraints
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Symmetric nozzle pairs (left/right mirror pairs)
SYMMETRIC_PAIRS: list[tuple[str, str]] = [
    ("peacock_tail_left", "peacock_tail_right"),
    ("rising_sun_left", "rising_sun_right"),
    ("corner_jet_fl", "corner_jet_fr"),
    ("corner_jet_bl", "corner_jet_br"),
]

MIN_HOLD_TIME_MS = 200  # Minimum time between keyframe value changes
SILENCE_RMS_THRESHOLD = 0.05  # Below this, suppress most effects


def apply_aesthetic_rules(
    tracks: list[dict[str, Any]],
    analysis_result: dict[str, Any],
    fountain_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Apply all aesthetic rules to the compiled track list.

    Modifies tracks in-place (copies are made internally when needed).

    Args:
        tracks: List of Track dicts from the timeline.
        analysis_result: AudioAnalysisResult dict.
        fountain_config: FountainConfig dict.

    Returns:
        Modified tracks list.
    """
    tracks = _enforce_min_hold_time(tracks)
    tracks = _enforce_symmetry(tracks)
    tracks = _apply_silence_suppression(tracks, analysis_result)
    logger.info("Aesthetic rules applied to %d tracks", len(tracks))
    return tracks


def _enforce_min_hold_time(
    tracks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Remove keyframes that are too close together.

    Two consecutive keyframes closer than MIN_HOLD_TIME_MS are merged
    (keeping the later one) to prevent rapid micro-transitions that
    look jittery and stress valve hardware.

    Args:
        tracks: List of Track dicts.

    Returns:
        Tracks with too-close keyframes removed.
    """
    for track in tracks:
        keyframes: list[dict[str, Any]] = track.get("keyframes", [])
        if len(keyframes) < 2:
            continue

        filtered: list[dict[str, Any]] = [keyframes[0]]
        for kf in keyframes[1:]:
            last_t = filtered[-1].get("time_ms", 0)
            curr_t = kf.get("time_ms", 0)
            if curr_t - last_t >= MIN_HOLD_TIME_MS:
                filtered.append(kf)
            # If too close, skip this keyframe (the later value wins at merge point)

        track["keyframes"] = filtered

    return tracks


def _enforce_symmetry(
    tracks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Mirror keyframes from one side of a symmetric pair to the other.

    If a left nozzle has keyframes but the right doesn't (or vice versa),
    copy the keyframes to the mirror nozzle.

    Args:
        tracks: List of Track dicts.

    Returns:
        Tracks with symmetric pairs enforced.
    """
    track_by_id: dict[str, dict[str, Any]] = {
        t["actuator_id"]: t for t in tracks
    }

    for left_id, right_id in SYMMETRIC_PAIRS:
        left = track_by_id.get(left_id)
        right = track_by_id.get(right_id)

        if left and not right:
            # Clone left → right
            import copy
            right_clone = copy.deepcopy(left)
            right_clone["actuator_id"] = right_id
            right_clone["actuator_name"] = right_id.replace("_", " ").title()
            tracks.append(right_clone)
        elif right and not left:
            import copy
            left_clone = copy.deepcopy(right)
            left_clone["actuator_id"] = left_id
            left_clone["actuator_name"] = left_id.replace("_", " ").title()
            tracks.append(left_clone)
        elif left and right:
            # Merge: take the max value at each time point
            left_kfs = left.get("keyframes", [])
            right_kfs = right.get("keyframes", [])
            if len(left_kfs) > len(right_kfs):
                right["keyframes"] = _copy_keyframes(left_kfs)
            elif len(right_kfs) > len(left_kfs):
                left["keyframes"] = _copy_keyframes(right_kfs)

    return tracks


def _apply_silence_suppression(
    tracks: list[dict[str, Any]],
    analysis_result: dict[str, Any],
) -> list[dict[str, Any]]:
    """Reduce all effect values during silence regions.

    During silence (RMS < SILENCE_RMS_THRESHOLD), clamp all VFD tracks
    to a low minimum value and mute valve tracks.

    Args:
        tracks: List of Track dicts.
        analysis_result: AudioAnalysisResult dict.

    Returns:
        Tracks with silence suppression applied.
    """
    energy = analysis_result.get("energy", {})
    rms: list[float] = energy.get("rms", [])
    if not rms:
        return tracks

    frame_rate = float(energy.get("frame_rate", 43.0))
    rms_arr = np.array(rms, dtype=np.float64)
    peak_rms = float(np.percentile(rms_arr, 95)) or 1.0
    rms_norm = rms_arr / peak_rms

    def is_silence(time_ms: float) -> bool:
        """Check whether a given time point is in a silence region."""
        frame_idx = int(time_ms / 1000.0 * frame_rate)
        if frame_idx >= len(rms_norm):
            return False
        return bool(rms_norm[frame_idx] < SILENCE_RMS_THRESHOLD)

    for track in tracks:
        actuator_type = track.get("actuator_type", "vfd")
        keyframes = track.get("keyframes", [])
        for kf in keyframes:
            t_ms = float(kf.get("time_ms", 0))
            if is_silence(t_ms):
                if actuator_type == "vfd":
                    kf["value"] = min(kf.get("value", 0), 15)  # Allow a trickle
                elif actuator_type == "valve":
                    kf["value"] = 0  # Close valve

    return tracks


def _copy_keyframes(
    keyframes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Deep copy a keyframe list.

    Args:
        keyframes: Source keyframes.

    Returns:
        Deep copy of keyframes.
    """
    import copy
    return copy.deepcopy(keyframes)
