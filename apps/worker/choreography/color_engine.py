"""
Color engine — RGB LED color choreography.

Maps musical features to RGB colors:
  - Section theme → base hue + saturation
  - RMS energy → brightness (value)
  - Beat events → brief brightness flash (strobe)
  - Spectral centroid → subtle hue modulation

Color space: HSV internally, converted to RGB (0–255) for DMX output.
"""

from __future__ import annotations

import colorsys
import logging
import math
from typing import Any

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

FRAME_RATE = 40  # fps
BEAT_FLASH_DURATION_MS = 60  # How long a beat flash lasts
BEAT_FLASH_VALUE_BOOST = 0.4  # How much to add to brightness on a beat


def generate_led_keyframes(
    analysis_result: dict[str, Any],
    fountain_config: dict[str, Any],
    section_themes: list[tuple[dict[str, Any], Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Generate RGB LED keyframes from audio features and section themes.

    Args:
        analysis_result: AudioAnalysisResult dict.
        fountain_config: FountainConfig dict.
        section_themes: List of (section, ChoreographyTheme).

    Returns:
        Dict mapping led_group_id → list of keyframe dicts
        {time_ms, value_r, value_g, value_b, easing}.
    """
    led_config: dict[str, Any] = fountain_config.get("leds", {})
    if not led_config or led_config.get("count", 0) == 0:
        logger.info("No LED config found, skipping color generation")
        return {}

    duration_ms = float(analysis_result.get("duration_ms", 0))
    total_frames = int(duration_ms / 1000.0 * FRAME_RATE) + 1

    energy = analysis_result.get("energy", {})
    rms: NDArray[np.float64] = np.array(energy.get("rms", []), dtype=np.float64)
    analysis_frame_rate = float(energy.get("frame_rate", 43.0))
    beats: list[dict[str, Any]] = analysis_result.get("beats", [])

    # Build beat flash mask (normalized 0–1, 1 = beat peak)
    beat_flash_frames = _build_beat_flash_mask(beats, total_frames, FRAME_RATE)

    # Resample RMS to show frame rate
    if rms.size > 0:
        rms_resampled = _resample_array(rms, total_frames)
        rms_peak = float(np.percentile(rms_resampled, 95)) or 1.0
        rms_norm = np.clip(rms_resampled / rms_peak, 0.0, 1.0)
    else:
        rms_norm = np.zeros(total_frames)

    # Build per-frame HSV values from section themes
    hue_frames, sat_frames = _build_hue_sat_frames(section_themes, total_frames, FRAME_RATE)

    # Combine brightness: base from RMS + beat flash boost
    val_frames = np.clip(
        rms_norm * 0.6 + 0.3 + beat_flash_frames * BEAT_FLASH_VALUE_BOOST,
        0.0,
        1.0,
    )

    # Convert HSV → RGB per frame
    rgb_frames = _hsv_to_rgb_array(hue_frames, sat_frames, val_frames)

    # Determine LED groups
    groups: list[dict[str, Any]] = led_config.get("groups", [])
    if not groups:
        # Treat all LEDs as one group
        groups = [{"id": "all_leds", "name": "All LEDs"}]

    keyframes_by_group: dict[str, list[dict[str, Any]]] = {}
    for group in groups:
        group_id = group["id"]
        kfs = _reduce_rgb_to_keyframes(rgb_frames)
        keyframes_by_group[group_id] = kfs

    logger.info(
        "Generated LED keyframes for %d groups, frames=%d",
        len(keyframes_by_group),
        total_frames,
    )
    return keyframes_by_group


def _build_beat_flash_mask(
    beats: list[dict[str, Any]],
    total_frames: int,
    frame_rate: int,
) -> NDArray[np.float64]:
    """Build a flash envelope (0–1) that peaks at each beat and decays.

    Args:
        beats: List of beat dicts with time_ms and strength.
        total_frames: Total show frames.
        frame_rate: Show frame rate.

    Returns:
        Flash envelope array.
    """
    mask = np.zeros(total_frames, dtype=np.float64)
    flash_frames = max(1, int(BEAT_FLASH_DURATION_MS / 1000.0 * frame_rate))

    for beat in beats:
        t_ms = float(beat.get("time_ms", 0))
        strength = float(beat.get("strength", 0.5))
        frame_idx = int(t_ms / 1000.0 * frame_rate)
        if frame_idx >= total_frames:
            continue
        # Decay envelope for the flash
        for j in range(flash_frames):
            fi = frame_idx + j
            if fi >= total_frames:
                break
            decay = math.exp(-3.0 * j / flash_frames)
            mask[fi] = max(mask[fi], strength * decay)

    return mask


def _build_hue_sat_frames(
    section_themes: list[tuple[dict[str, Any], Any]],
    total_frames: int,
    frame_rate: int,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Build per-frame hue and saturation arrays from section themes.

    Applies 1-second crossfade at section boundaries.

    Args:
        section_themes: List of (section, ChoreographyTheme).
        total_frames: Total show frames.
        frame_rate: Show frame rate.

    Returns:
        (hue_array, sat_array) each of length total_frames.
    """
    hue = np.zeros(total_frames, dtype=np.float64)
    sat = np.zeros(total_frames, dtype=np.float64)
    crossfade_frames = int(1.0 * frame_rate)  # 1-second crossfade

    for i, (section, theme) in enumerate(section_themes):
        if theme is None:
            continue
        start_f = int(float(section.get("start_ms", 0)) / 1000.0 * frame_rate)
        end_ms = float(section.get("end_ms", total_frames * 1000.0 / frame_rate))
        end_f = min(total_frames, int(end_ms / 1000.0 * frame_rate))

        target_hue = float(theme.led_hue)
        target_sat = float(theme.led_saturation)

        for f in range(start_f, end_f):
            # Fade in at section start
            pos_in_section = f - start_f
            fade = min(1.0, pos_in_section / max(1, crossfade_frames))
            hue[f] = target_hue
            sat[f] = target_sat * fade

    return hue, sat


def _hsv_to_rgb_array(
    hue: NDArray[np.float64],
    sat: NDArray[np.float64],
    val: NDArray[np.float64],
) -> NDArray[np.uint8]:
    """Vectorized HSV to RGB conversion.

    Args:
        hue: Hue array (0.0–1.0).
        sat: Saturation array (0.0–1.0).
        val: Value (brightness) array (0.0–1.0).

    Returns:
        RGB array of shape (N, 3) with dtype uint8 (0–255).
    """
    n = len(hue)
    rgb = np.zeros((n, 3), dtype=np.uint8)
    for i in range(n):
        r, g, b = colorsys.hsv_to_rgb(float(hue[i]), float(sat[i]), float(val[i]))
        rgb[i] = [int(r * 255), int(g * 255), int(b * 255)]
    return rgb


def _reduce_rgb_to_keyframes(
    rgb_frames: NDArray[np.uint8],
    min_delta: int = 8,
) -> list[dict[str, Any]]:
    """Reduce dense per-frame RGB to sparse keyframes.

    Args:
        rgb_frames: (N, 3) uint8 array.
        min_delta: Minimum per-channel change to emit a keyframe.

    Returns:
        List of keyframe dicts: {time_ms, value_r, value_g, value_b, easing}.
    """
    if len(rgb_frames) == 0:
        return []

    ms_per_frame = 1000.0 / FRAME_RATE
    keyframes: list[dict[str, Any]] = []

    def make_kf(i: int, easing: str = "linear") -> dict[str, Any]:
        r, g, b = int(rgb_frames[i, 0]), int(rgb_frames[i, 1]), int(rgb_frames[i, 2])
        return {
            "time_ms": round(i * ms_per_frame),
            "value": 0,
            "value_r": r,
            "value_g": g,
            "value_b": b,
            "easing": easing,
        }

    keyframes.append(make_kf(0))
    last_rgb = rgb_frames[0].copy()

    for i in range(1, len(rgb_frames) - 1):
        delta = np.max(np.abs(rgb_frames[i].astype(np.int32) - last_rgb.astype(np.int32)))
        if delta >= min_delta:
            keyframes.append(make_kf(i))
            last_rgb = rgb_frames[i].copy()

    keyframes.append(make_kf(len(rgb_frames) - 1, easing="step"))
    return keyframes


def _resample_array(arr: NDArray[np.float64], target_len: int) -> NDArray[np.float64]:
    """Linear interpolation resample.

    Args:
        arr: Source array.
        target_len: Desired length.

    Returns:
        Resampled array.
    """
    if len(arr) == target_len:
        return arr
    src_idx = np.linspace(0, len(arr) - 1, target_len)
    return np.interp(src_idx, np.arange(len(arr)), arr)
