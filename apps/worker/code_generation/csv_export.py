"""
CSV export — outputs the show timeline as timestamp,channel,value rows.

Format: one row per frame per channel (dense representation).
Suitable for import into PLCs, spreadsheets, or custom control software.
"""

from __future__ import annotations

import io
import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

FRAME_RATE = 40  # fps


def generate_csv(
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
) -> dict[str, Any]:
    """Generate a CSV file from the ShowTimeline.

    Expands keyframes to dense per-frame rows:
      timestamp_ms, channel_id, value

    Args:
        show_timeline: ShowTimeline dict.
        fountain_config: FountainConfig dict.

    Returns:
        GenerationResult dict.
    """
    meta = show_timeline.get("metadata", {})
    duration_ms = float(meta.get("duration_ms", 0))
    frame_rate = int(meta.get("frame_rate", FRAME_RATE))
    total_frames = int(meta.get("total_frames", int(duration_ms / 1000.0 * frame_rate) + 1))
    tracks: list[dict[str, Any]] = show_timeline.get("tracks", [])

    output = io.StringIO()
    output.write("timestamp_ms,channel_id,actuator_type,dmx_universe,dmx_channel,value\n")

    ms_per_frame = 1000.0 / frame_rate

    for frame_idx in range(total_frames):
        t_ms = frame_idx * ms_per_frame
        for track in tracks:
            actuator_id = track.get("actuator_id", "unknown")
            actuator_type = track.get("actuator_type", "generic")
            dmx_universe = track.get("dmx_universe", 1)
            dmx_channel = track.get("dmx_channel", 1)
            keyframes = track.get("keyframes", [])

            if actuator_type == "rgb_led":
                r, g, b = _interpolate_rgb(keyframes, t_ms)
                output.write(f"{t_ms:.1f},{actuator_id}_r,rgb_led,{dmx_universe},{dmx_channel},{r}\n")
                output.write(f"{t_ms:.1f},{actuator_id}_g,rgb_led,{dmx_universe},{dmx_channel + 1},{g}\n")
                output.write(f"{t_ms:.1f},{actuator_id}_b,rgb_led,{dmx_universe},{dmx_channel + 2},{b}\n")
            else:
                value = _interpolate_value(keyframes, t_ms)
                output.write(f"{t_ms:.1f},{actuator_id},{actuator_type},{dmx_universe},{dmx_channel},{value}\n")

    csv_str = output.getvalue()
    song_name = meta.get("song_name", "show")

    import re
    safe_name = re.sub(r"[^\w\-]", "_", song_name.lower())[:40]
    filename = f"{safe_name}_timeline.csv"

    logger.info("CSV generated: %d bytes, %d frames, %d tracks", len(csv_str), total_frames, len(tracks))

    readme = f"""# FountainFlow CSV Export

Song: {song_name}
Duration: {duration_ms / 1000:.1f}s
Frame rate: {frame_rate} fps
Columns: timestamp_ms, channel_id, actuator_type, dmx_universe, dmx_channel, value

Import into your PLC, spreadsheet, or control software.
Values are 0-255 (DMX range). RGB LEDs have 3 rows per frame (_r, _g, _b).
"""

    return {
        "platform": "csv",
        "files": [
            {
                "filename": filename,
                "content_type": "text",
                "content": csv_str,
                "size_bytes": len(csv_str.encode("utf-8")),
                "description": "Dense per-frame CSV timeline",
            },
            {
                "filename": "CSV_README.md",
                "content_type": "text",
                "content": readme,
                "size_bytes": len(readme.encode("utf-8")),
                "description": "CSV format explanation",
            },
        ],
        "readme": readme,
        "storage_required_bytes": len(csv_str.encode("utf-8")),
        "generated_at": meta.get("generated_at", ""),
    }


def _interpolate_value(keyframes: list[dict[str, Any]], t_ms: float) -> int:
    """Interpolate a single-channel value at time t_ms.

    Args:
        keyframes: List of keyframe dicts.
        t_ms: Time in milliseconds.

    Returns:
        Interpolated DMX value 0–255.
    """
    if not keyframes:
        return 0

    # Find surrounding keyframes
    prev_kf = keyframes[0]
    next_kf = keyframes[0]

    for kf in keyframes:
        if kf["time_ms"] <= t_ms:
            prev_kf = kf
        if kf["time_ms"] >= t_ms:
            next_kf = kf
            break

    if prev_kf["time_ms"] == next_kf["time_ms"]:
        return int(prev_kf.get("value", 0))

    easing = prev_kf.get("easing", "linear")
    if easing == "step":
        return int(prev_kf.get("value", 0))

    # Linear interpolation (simplified — easeIn/Out treated as linear for CSV)
    t = (t_ms - prev_kf["time_ms"]) / (next_kf["time_ms"] - prev_kf["time_ms"])
    t = max(0.0, min(1.0, t))

    v0 = float(prev_kf.get("value", 0))
    v1 = float(next_kf.get("value", 0))
    return int(round(v0 + (v1 - v0) * t))


def _interpolate_rgb(
    keyframes: list[dict[str, Any]],
    t_ms: float,
) -> tuple[int, int, int]:
    """Interpolate RGB values at time t_ms.

    Args:
        keyframes: List of RGB keyframe dicts.
        t_ms: Time in milliseconds.

    Returns:
        (r, g, b) tuple with values 0–255.
    """
    if not keyframes:
        return (0, 0, 0)

    prev_kf = keyframes[0]
    next_kf = keyframes[0]

    for kf in keyframes:
        if kf["time_ms"] <= t_ms:
            prev_kf = kf
        if kf["time_ms"] >= t_ms:
            next_kf = kf
            break

    easing = prev_kf.get("easing", "linear")
    if easing == "step" or prev_kf["time_ms"] == next_kf["time_ms"]:
        return (
            int(prev_kf.get("value_r", 0)),
            int(prev_kf.get("value_g", 0)),
            int(prev_kf.get("value_b", 0)),
        )

    t = (t_ms - prev_kf["time_ms"]) / (next_kf["time_ms"] - prev_kf["time_ms"])
    t = max(0.0, min(1.0, t))

    def lerp(a: int, b: int) -> int:
        return int(round(a + (b - a) * t))

    return (
        lerp(int(prev_kf.get("value_r", 0)), int(next_kf.get("value_r", 0))),
        lerp(int(prev_kf.get("value_g", 0)), int(next_kf.get("value_g", 0))),
        lerp(int(prev_kf.get("value_b", 0)), int(next_kf.get("value_b", 0))),
    )
