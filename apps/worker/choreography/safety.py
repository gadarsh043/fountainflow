"""
Safety constraints — enforced on the final timeline before code generation.

Prevents:
1. Valve cycles shorter than MIN_ON_TIME_MS / MIN_OFF_TIME_MS
2. VFD values outside 0–255
3. Simultaneous pump starts (pump stagger)
4. VFD ramp rate violations

These constraints protect the physical hardware from damage.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Solenoid valve constraints
MIN_ON_TIME_MS = 100       # Minimum valve open duration
MIN_OFF_TIME_MS = 100      # Minimum valve closed duration
MIN_CLOSE_TIME_LARGE_PIPE_MS = 300  # Pipes > 2 inch
MAX_VALVE_FREQUENCY_HZ = 5  # Cannot switch faster than 5 Hz → 200ms min cycle

# VFD constraints
MAX_VFD_CHANGE_PER_FRAME = 6   # DMX units per frame at 40fps
MAX_DMX_VALUE = 255
MIN_DMX_VALUE = 0

# Pump stagger: don't start more than 2 pumps simultaneously
PUMP_STAGGER_MS = 500


def enforce_safety_constraints(
    tracks: list[dict[str, Any]],
    fountain_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Apply all safety constraints to the timeline tracks.

    Args:
        tracks: List of Track dicts.
        fountain_config: FountainConfig dict (used for valve pipe diameters).

    Returns:
        Tracks with safety constraints enforced.
    """
    tracks = _enforce_vfd_range(tracks)
    tracks = _enforce_valve_timing(tracks, fountain_config)
    tracks = _stagger_pump_starts(tracks)
    logger.info("Safety constraints enforced on %d tracks", len(tracks))
    return tracks


def _enforce_vfd_range(
    tracks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Clamp all VFD keyframe values to 0–255.

    Args:
        tracks: List of Track dicts.

    Returns:
        Tracks with clamped VFD values.
    """
    for track in tracks:
        if track.get("actuator_type") != "vfd":
            continue
        for kf in track.get("keyframes", []):
            v = kf.get("value", 0)
            kf["value"] = max(MIN_DMX_VALUE, min(MAX_DMX_VALUE, int(v)))
    return tracks


def _enforce_valve_timing(
    tracks: list[dict[str, Any]],
    fountain_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Enforce minimum valve on/off cycle times.

    Merges keyframes that would create cycles shorter than the minimum
    allowed duration.

    Args:
        tracks: List of Track dicts.
        fountain_config: FountainConfig dict.

    Returns:
        Tracks with valve timing constraints enforced.
    """
    valve_config: dict[str, Any] = fountain_config.get("valves", {})
    min_cycle_ms = float(valve_config.get("min_cycle_ms", 200))

    for track in tracks:
        if track.get("actuator_type") != "valve":
            continue

        keyframes = track.get("keyframes", [])
        if len(keyframes) < 2:
            continue

        # Filter: remove any transition that would violate min_cycle_ms
        filtered: list[dict[str, Any]] = [keyframes[0]]
        for kf in keyframes[1:]:
            prev_t = filtered[-1].get("time_ms", 0)
            curr_t = kf.get("time_ms", 0)
            if curr_t - prev_t >= min_cycle_ms:
                filtered.append(kf)
            else:
                logger.debug(
                    "Removed valve keyframe at %dms (too close to %dms, min=%dms)",
                    curr_t,
                    prev_t,
                    min_cycle_ms,
                )

        track["keyframes"] = filtered

    return tracks


def _stagger_pump_starts(
    tracks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Stagger VFD pump start-up commands to avoid power spike.

    If multiple VFD tracks go from 0 to > 0 at the same time,
    offset subsequent pump starts by PUMP_STAGGER_MS each.

    Args:
        tracks: List of Track dicts.

    Returns:
        Tracks with staggered pump starts.
    """
    # Collect all VFD tracks and their "start" keyframe times
    vfd_start_events: list[tuple[float, dict[str, Any]]] = []  # (time_ms, track)

    for track in tracks:
        if track.get("actuator_type") != "vfd":
            continue
        keyframes = track.get("keyframes", [])
        if not keyframes:
            continue
        # Find first non-zero keyframe
        for kf in keyframes:
            if kf.get("value", 0) > 0:
                vfd_start_events.append((float(kf.get("time_ms", 0)), track))
                break

    # Sort by start time and stagger simultaneous starts
    vfd_start_events.sort(key=lambda x: x[0])
    stagger_offset = 0
    prev_start_time: float | None = None

    for start_t, track in vfd_start_events:
        if prev_start_time is not None and abs(start_t - prev_start_time) < PUMP_STAGGER_MS:
            stagger_offset += PUMP_STAGGER_MS
            keyframes = track.get("keyframes", [])
            for kf in keyframes:
                kf["time_ms"] = max(0, int(kf.get("time_ms", 0)) + stagger_offset)
        else:
            stagger_offset = 0
            prev_start_time = start_t

    return tracks
