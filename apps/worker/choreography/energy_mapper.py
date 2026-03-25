"""
Energy mapper — Layer 3 of choreography generation.

Maps frequency band energies to VFD pump speed values at 40fps.

Key physics: jet height ∝ pump_speed², so to achieve a target height fraction h:
    vfd_speed = sqrt(h) * max_vfd
    dmx_value = int(vfd_speed * 255)

Exponential smoothing is applied to prevent jarring speed jumps.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Frequency band → nozzle group mapping
BAND_NOZZLE_MAP: dict[str, list[str]] = {
    "sub_bass": ["water_screen"],
    "bass": ["center_jet", "high_jets", "ring_fountains"],
    "low_mid": ["organ_fountains", "corner_jets"],
    "mid": ["peacock_tail", "rising_sun", "revolving"],
    "high_mid": ["butterfly", "moving_head"],
    "treble": ["mist_lines"],
}

FRAME_RATE = 40  # fps
MAX_VFD_CHANGE_PER_FRAME = 6  # DMX units per frame (safety constraint)


def generate_vfd_keyframes(
    analysis_result: dict[str, Any],
    fountain_config: dict[str, Any],
    section_themes: list[tuple[dict[str, Any], Any]],
    smoothing_alpha: float = 0.15,
) -> dict[str, list[dict[str, Any]]]:
    """Generate VFD speed keyframes from band energies.

    Uses a rolling exponential smoothing filter and clamps changes to
    MAX_VFD_CHANGE_PER_FRAME to respect VFD ramp rate constraints.

    Args:
        analysis_result: AudioAnalysisResult dict from the analysis pipeline.
        fountain_config: FountainConfig dict.
        section_themes: List of (section, ChoreographyTheme) from section_themes.py.
        smoothing_alpha: EMA smoothing factor (0 = very smooth, 1 = no smoothing).

    Returns:
        Dict mapping nozzle_id → list of keyframe dicts {time_ms, value, easing}.
    """
    energy = analysis_result.get("energy", {})
    bands: dict[str, list[float]] = energy.get("bands", {})
    analysis_frame_rate = float(energy.get("frame_rate", 43.0))
    duration_ms = float(analysis_result.get("duration_ms", 0))

    if not bands:
        logger.warning("No band energy data in analysis result")
        return {}

    # Build set of available nozzle IDs from the fountain config
    available_nozzles: set[str] = {n["id"] for n in fountain_config.get("nozzles", [])}

    # Map nozzle_id → band name
    nozzle_to_band: dict[str, str] = {}
    for band_name, nozzle_ids in BAND_NOZZLE_MAP.items():
        for nozzle_id in nozzle_ids:
            if nozzle_id in available_nozzles:
                nozzle_to_band[nozzle_id] = band_name

    # Build a time-indexed array for each active nozzle
    # Resample analysis frames to show frames (40fps)
    total_show_frames = int(duration_ms / 1000.0 * FRAME_RATE) + 1

    # Build section timeline: for each show frame, find the active theme
    section_active_map = _build_section_active_map(
        section_themes=section_themes,
        total_frames=total_show_frames,
        frame_rate=FRAME_RATE,
    )

    keyframes_by_nozzle: dict[str, list[dict[str, Any]]] = {}

    for nozzle_id, band_name in nozzle_to_band.items():
        band_energy = np.array(bands.get(band_name, []), dtype=np.float64)
        if band_energy.size == 0:
            continue

        # Normalize band energy to 0–1
        peak = float(np.percentile(band_energy, 98)) or 1.0
        band_norm = np.clip(band_energy / peak, 0.0, 1.0)

        # Resample from analysis frame rate to show frame rate
        resampled = _resample_array(band_norm, total_show_frames)

        # Apply square-root correction (pump affinity law: H ∝ N²)
        vfd_raw = np.sqrt(resampled)

        # Apply exponential smoothing
        vfd_smooth = _ema_smooth(vfd_raw, alpha=smoothing_alpha)

        # Clamp VFD values using section theme min/max and activity mask
        vfd_clamped = _apply_section_constraints(
            vfd_smooth,
            nozzle_id=nozzle_id,
            section_active_map=section_active_map,
            section_themes=section_themes,
            frame_rate=FRAME_RATE,
        )

        # Apply max-change-per-frame constraint (VFD ramp rate)
        vfd_final = _apply_ramp_constraint(vfd_clamped, max_change=MAX_VFD_CHANGE_PER_FRAME / 255.0)

        # Convert to DMX values (0–255)
        dmx_values = np.round(vfd_final * 255.0).astype(np.int16)
        dmx_values = np.clip(dmx_values, 0, 255)

        # Reduce to keyframes (only emit when value changes significantly)
        keyframes = _reduce_to_keyframes(dmx_values, min_delta=3)
        keyframes_by_nozzle[nozzle_id] = keyframes

    logger.info(
        "Generated VFD keyframes for %d nozzles, total_frames=%d",
        len(keyframes_by_nozzle),
        total_show_frames,
    )
    return keyframes_by_nozzle


def _build_section_active_map(
    section_themes: list[tuple[dict[str, Any], Any]],
    total_frames: int,
    frame_rate: int,
) -> list[tuple[dict[str, Any], Any]]:
    """Return a per-frame lookup: (section, theme) for each show frame.

    Args:
        section_themes: List of (section, ChoreographyTheme).
        total_frames: Total show frames.
        frame_rate: Show frame rate (40).

    Returns:
        List of (section, theme) indexed by frame number.
    """
    lookup: list[tuple[dict[str, Any], Any]] = []
    for frame_idx in range(total_frames):
        t_ms = frame_idx * 1000.0 / frame_rate
        active = _find_theme_at_time(section_themes, t_ms)
        lookup.append(active)
    return lookup


def _find_theme_at_time(
    section_themes: list[tuple[dict[str, Any], Any]],
    time_ms: float,
) -> tuple[dict[str, Any], Any]:
    """Find the (section, theme) tuple active at a given time.

    Args:
        section_themes: Sorted list of (section, theme).
        time_ms: Time in milliseconds.

    Returns:
        The (section, theme) pair active at time_ms.
    """
    for section, theme in reversed(section_themes):
        if time_ms >= float(section.get("start_ms", 0)):
            return (section, theme)
    # Fallback: return first section
    if section_themes:
        return section_themes[0]
    return ({}, None)


def _apply_section_constraints(
    vfd_array: NDArray[np.float64],
    nozzle_id: str,
    section_active_map: list[tuple[dict[str, Any], Any]],
    section_themes: list[tuple[dict[str, Any], Any]],
    frame_rate: int,
) -> NDArray[np.float64]:
    """Clamp VFD values to theme min/max and zero out inactive nozzles.

    Args:
        vfd_array: Raw VFD values 0.0–1.0 for each frame.
        nozzle_id: Nozzle group ID to check.
        section_active_map: Per-frame (section, theme) lookup.
        section_themes: Full section themes list (unused here, kept for signature).
        frame_rate: Show frame rate.

    Returns:
        Constrained VFD array.
    """
    result = vfd_array.copy()
    for i, (_, theme) in enumerate(section_active_map):
        if theme is None:
            result[i] = 0.0
            continue
        if nozzle_id not in theme.active_nozzles:
            result[i] = 0.0
        else:
            vmin = theme.base_vfd_min / 255.0
            vmax = theme.base_vfd_max / 255.0
            result[i] = float(np.clip(result[i] * vmax + vmin * (1.0 - result[i]), vmin, vmax))
    return result


def _resample_array(arr: NDArray[np.float64], target_len: int) -> NDArray[np.float64]:
    """Linear interpolation resample.

    Args:
        arr: Source array.
        target_len: Desired output length.

    Returns:
        Resampled array of length target_len.
    """
    if len(arr) == target_len:
        return arr
    src_indices = np.linspace(0, len(arr) - 1, target_len)
    return np.interp(src_indices, np.arange(len(arr)), arr)


def _ema_smooth(arr: NDArray[np.float64], alpha: float) -> NDArray[np.float64]:
    """Exponential moving average smoothing.

    Args:
        arr: Input signal.
        alpha: Smoothing factor (0 = max smooth, 1 = no smoothing).

    Returns:
        Smoothed array.
    """
    result = np.empty_like(arr)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1.0 - alpha) * result[i - 1]
    return result


def _apply_ramp_constraint(
    arr: NDArray[np.float64],
    max_change: float,
) -> NDArray[np.float64]:
    """Enforce maximum change per frame (VFD ramp rate).

    Args:
        arr: VFD values 0.0–1.0.
        max_change: Maximum allowed change per frame (in normalized units).

    Returns:
        Ramp-constrained array.
    """
    result = arr.copy()
    for i in range(1, len(result)):
        delta = result[i] - result[i - 1]
        if abs(delta) > max_change:
            result[i] = result[i - 1] + math.copysign(max_change, delta)
    return result


def _reduce_to_keyframes(
    dmx_values: NDArray[np.int16],
    min_delta: int = 3,
) -> list[dict[str, Any]]:
    """Convert dense per-frame values to sparse keyframes.

    Emits a keyframe whenever the value changes by >= min_delta,
    plus always the first and last frames.

    Args:
        dmx_values: Per-frame DMX values (0–255).
        min_delta: Minimum change to emit a new keyframe.

    Returns:
        List of keyframe dicts: {time_ms, value, easing}.
    """
    if len(dmx_values) == 0:
        return []

    keyframes: list[dict[str, Any]] = []
    ms_per_frame = 1000.0 / FRAME_RATE

    # Always emit first frame
    keyframes.append({
        "time_ms": 0,
        "value": int(dmx_values[0]),
        "easing": "linear",
    })

    last_emitted_value = int(dmx_values[0])

    for i in range(1, len(dmx_values) - 1):
        v = int(dmx_values[i])
        if abs(v - last_emitted_value) >= min_delta:
            keyframes.append({
                "time_ms": round(i * ms_per_frame),
                "value": v,
                "easing": "linear",
            })
            last_emitted_value = v

    # Always emit last frame
    last_v = int(dmx_values[-1])
    keyframes.append({
        "time_ms": round((len(dmx_values) - 1) * ms_per_frame),
        "value": last_v,
        "easing": "step",
    })

    return keyframes
