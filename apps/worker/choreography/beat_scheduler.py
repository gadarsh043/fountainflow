"""
Beat scheduler — Layer 2 of choreography generation.

Translates beat events into valve open/close keyframes for each active nozzle.
Different valve patterns are defined per ChoreographyTheme (gentle, rhythmic,
spectacle, building, sweeping, minimal).

Physics constraints (enforced here, also rechecked in safety.py):
  - MIN_ON_TIME_MS  = 100ms — minimum valve open time
  - MIN_OFF_TIME_MS = 100ms — minimum valve closed time
  - MIN_CLOSE_LARGE = 300ms — large pipe minimum close time
  - MAX_FREQ_HZ     = 5 Hz  — no faster than 5 cycles/second
"""

from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Valve timing constants (from CLAUDE.md §5.3)
# ---------------------------------------------------------------------------

MIN_ON_TIME_MS: float = 100.0
MIN_OFF_TIME_MS: float = 100.0
MIN_CLOSE_LARGE_PIPE_MS: float = 300.0
MAX_VALVE_FREQUENCY_HZ: float = 5.0
MIN_CYCLE_MS: float = 1000.0 / MAX_VALVE_FREQUENCY_HZ  # = 200ms


# ---------------------------------------------------------------------------
# Keyframe type
# ---------------------------------------------------------------------------

def _kf(time_ms: float, value: int, easing: str = "step") -> dict[str, Any]:
    """Create a keyframe dict.

    Args:
        time_ms: Time in milliseconds.
        value: DMX value (0–255).
        easing: Easing type string.

    Returns:
        Keyframe dict.
    """
    return {"time_ms": round(time_ms, 1), "value": value, "easing": easing}


# ---------------------------------------------------------------------------
# Pattern functions
# ---------------------------------------------------------------------------


def _schedule_gentle(
    beats: list[dict[str, Any]],
    section_start_ms: float,
    section_end_ms: float,
) -> list[dict[str, Any]]:
    """Gentle pattern: valve opens on every 4th beat (downbeat), holds 400ms.

    Args:
        beats: Beat events filtered to this section.
        section_start_ms: Section start in ms.
        section_end_ms: Section end in ms.

    Returns:
        List of keyframes (time_ms, value, easing).
    """
    keyframes: list[dict[str, Any]] = [_kf(section_start_ms, 0)]
    last_off_ms = section_start_ms - MIN_OFF_TIME_MS

    for i, beat in enumerate(beats):
        if i % 4 != 0:  # Only downbeats
            continue
        on_ms = beat["time_ms"]
        if on_ms - last_off_ms < MIN_OFF_TIME_MS:
            continue
        off_ms = on_ms + 400.0
        off_ms = min(off_ms, section_end_ms - 10.0)
        if off_ms - on_ms < MIN_ON_TIME_MS:
            continue
        keyframes.extend([_kf(on_ms, 255), _kf(off_ms, 0)])
        last_off_ms = off_ms

    keyframes.append(_kf(section_end_ms, 0))
    return keyframes


def _schedule_rhythmic(
    beats: list[dict[str, Any]],
    section_start_ms: float,
    section_end_ms: float,
) -> list[dict[str, Any]]:
    """Rhythmic pattern: valve opens on every beat, hold for half IBI.

    Args:
        beats: Beat events for this section.
        section_start_ms: Section start in ms.
        section_end_ms: Section end in ms.

    Returns:
        List of keyframes.
    """
    keyframes: list[dict[str, Any]] = [_kf(section_start_ms, 0)]
    last_off_ms = section_start_ms - MIN_CYCLE_MS

    for i, beat in enumerate(beats):
        on_ms = beat["time_ms"]
        if on_ms - last_off_ms < MIN_CYCLE_MS:
            continue

        # Hold for half the inter-beat interval, or 150ms minimum
        if i + 1 < len(beats):
            ibi = beats[i + 1]["time_ms"] - on_ms
            hold_ms = max(MIN_ON_TIME_MS, ibi * 0.45)
        else:
            hold_ms = 150.0

        off_ms = min(on_ms + hold_ms, section_end_ms - 10.0)
        if off_ms - on_ms < MIN_ON_TIME_MS:
            continue

        keyframes.extend([_kf(on_ms, 255), _kf(off_ms, 0)])
        last_off_ms = off_ms

    keyframes.append(_kf(section_end_ms, 0))
    return keyframes


def _schedule_spectacle(
    beats: list[dict[str, Any]],
    section_start_ms: float,
    section_end_ms: float,
) -> list[dict[str, Any]]:
    """Spectacle pattern: valve stays mostly open, closes briefly on weak beats.

    Args:
        beats: Beat events for this section.
        section_start_ms: Section start in ms.
        section_end_ms: Section end in ms.

    Returns:
        List of keyframes.
    """
    keyframes: list[dict[str, Any]] = [_kf(section_start_ms, 255)]  # Start open
    last_close_ms = section_start_ms - MIN_CYCLE_MS

    for i, beat in enumerate(beats):
        # Close on weak beats (beat 2 and 4 in 4/4)
        if i % 4 not in (1, 3):
            continue
        close_ms = beat["time_ms"]
        if close_ms - last_close_ms < MIN_CYCLE_MS:
            continue
        open_ms = close_ms + 120.0
        open_ms = min(open_ms, section_end_ms - 10.0)
        if open_ms - close_ms < MIN_ON_TIME_MS:
            continue
        keyframes.extend([_kf(close_ms, 0), _kf(open_ms, 255)])
        last_close_ms = close_ms

    keyframes.append(_kf(section_end_ms, 0))
    return keyframes


def _schedule_building(
    beats: list[dict[str, Any]],
    section_start_ms: float,
    section_end_ms: float,
) -> list[dict[str, Any]]:
    """Building pattern: increasing trigger density towards section end.

    Every beat in the second half, every 2nd beat in the first half.

    Args:
        beats: Beat events for this section.
        section_start_ms: Section start in ms.
        section_end_ms: Section end in ms.

    Returns:
        List of keyframes.
    """
    keyframes: list[dict[str, Any]] = [_kf(section_start_ms, 0)]
    mid_ms = section_start_ms + (section_end_ms - section_start_ms) * 0.5
    last_off_ms = section_start_ms - MIN_CYCLE_MS

    for i, beat in enumerate(beats):
        on_ms = beat["time_ms"]
        in_second_half = on_ms >= mid_ms
        # Denser in second half
        if not in_second_half and i % 2 != 0:
            continue
        if on_ms - last_off_ms < MIN_CYCLE_MS:
            continue

        hold_ms = 120.0 + (on_ms - section_start_ms) / (section_end_ms - section_start_ms + 1.0) * 80.0
        off_ms = min(on_ms + hold_ms, section_end_ms - 10.0)
        if off_ms - on_ms < MIN_ON_TIME_MS:
            continue

        keyframes.extend([_kf(on_ms, 255), _kf(off_ms, 0)])
        last_off_ms = off_ms

    keyframes.append(_kf(section_end_ms, 0))
    return keyframes


def _schedule_sweeping(
    beats: list[dict[str, Any]],
    section_start_ms: float,
    section_end_ms: float,
    nozzle_index: int = 0,
    total_nozzles: int = 1,
) -> list[dict[str, Any]]:
    """Sweeping pattern: staggered triggers across nozzles for wave effect.

    Args:
        beats: Beat events for this section.
        section_start_ms: Section start in ms.
        section_end_ms: Section end in ms.
        nozzle_index: Index of this nozzle in the active set.
        total_nozzles: Total number of active nozzles.

    Returns:
        List of keyframes.
    """
    keyframes: list[dict[str, Any]] = [_kf(section_start_ms, 0)]
    # Offset each nozzle by a fraction of a beat
    offset_ms = nozzle_index * (250.0 / max(total_nozzles, 1))
    last_off_ms = section_start_ms - MIN_CYCLE_MS

    for i, beat in enumerate(beats):
        if i % 2 != 0:
            continue
        on_ms = beat["time_ms"] + offset_ms
        if on_ms >= section_end_ms:
            break
        if on_ms - last_off_ms < MIN_CYCLE_MS:
            continue
        off_ms = min(on_ms + 200.0, section_end_ms - 10.0)
        if off_ms - on_ms < MIN_ON_TIME_MS:
            continue
        keyframes.extend([_kf(on_ms, 255), _kf(off_ms, 0)])
        last_off_ms = off_ms

    keyframes.append(_kf(section_end_ms, 0))
    return keyframes


def _schedule_minimal(
    beats: list[dict[str, Any]],
    section_start_ms: float,
    section_end_ms: float,
) -> list[dict[str, Any]]:
    """Minimal pattern: only triggers on every 8th beat (very sparse).

    Args:
        beats: Beat events for this section.
        section_start_ms: Section start in ms.
        section_end_ms: Section end in ms.

    Returns:
        List of keyframes.
    """
    keyframes: list[dict[str, Any]] = [_kf(section_start_ms, 0)]
    last_off_ms = section_start_ms - MIN_OFF_TIME_MS * 4

    for i, beat in enumerate(beats):
        if i % 8 != 0:
            continue
        on_ms = beat["time_ms"]
        if on_ms - last_off_ms < MIN_OFF_TIME_MS * 4:
            continue
        off_ms = min(on_ms + 600.0, section_end_ms - 10.0)
        if off_ms - on_ms < MIN_ON_TIME_MS:
            continue
        keyframes.extend([_kf(on_ms, 255), _kf(off_ms, 0)])
        last_off_ms = off_ms

    keyframes.append(_kf(section_end_ms, 0))
    return keyframes


# Pattern dispatch table
_PATTERN_MAP = {
    "gentle": _schedule_gentle,
    "rhythmic": _schedule_rhythmic,
    "spectacle": _schedule_spectacle,
    "building": _schedule_building,
    "sweeping": _schedule_sweeping,
    "minimal": _schedule_minimal,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def schedule_beats_for_section(
    section: dict[str, Any],
    theme: Any,  # ChoreographyTheme
    all_beats: list[dict[str, Any]],
    nozzle_id: str,
    nozzle_index: int,
    total_nozzles: int,
) -> list[dict[str, Any]]:
    """Generate valve keyframes for a single nozzle over a section.

    Args:
        section: SectionInfo dict.
        theme: ChoreographyTheme for this section.
        all_beats: All beat events from AudioAnalysisResult.
        nozzle_id: ID of the nozzle being scheduled.
        nozzle_index: Index of this nozzle among the active set.
        total_nozzles: Total active nozzles in section (for sweeping offset).

    Returns:
        List of valve keyframe dicts (time_ms, value, easing).
    """
    start_ms = float(section["start_ms"])
    end_ms = float(section["end_ms"])

    # Filter beats to this section
    section_beats = [
        b for b in all_beats if start_ms <= b["time_ms"] <= end_ms
    ]

    pattern_name = getattr(theme, "valve_pattern", "rhythmic")
    pattern_fn = _PATTERN_MAP.get(pattern_name, _schedule_rhythmic)

    if pattern_name == "sweeping":
        keyframes = pattern_fn(
            section_beats, start_ms, end_ms,
            nozzle_index=nozzle_index,
            total_nozzles=total_nozzles,
        )
    else:
        keyframes = pattern_fn(section_beats, start_ms, end_ms)

    logger.debug(
        "Scheduled %d valve keyframes for nozzle=%s, section=%s, pattern=%s",
        len(keyframes),
        nozzle_id,
        section.get("section_type"),
        pattern_name,
    )
    return keyframes
