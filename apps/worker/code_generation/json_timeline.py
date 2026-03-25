"""
JSON timeline generator — outputs the ShowTimeline as a human-readable JSON file.

This is the most portable output format: any custom controller can read
the keyframed timeline and interpolate values at playback time.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def generate_json_timeline(
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
) -> dict[str, Any]:
    """Generate a JSON timeline file from the ShowTimeline.

    Args:
        show_timeline: ShowTimeline dict from the choreography engine.
        fountain_config: FountainConfig dict (embedded in output for portability).

    Returns:
        GenerationResult dict with files list and readme.
    """
    # Embed fountain config in output for portability
    output = dict(show_timeline)
    output["fountain_config"] = fountain_config

    json_str = json.dumps(output, indent=2, default=str)
    song_name = show_timeline.get("metadata", {}).get("song_name", "show")
    filename = f"{_safe_filename(song_name)}_timeline.json"

    readme = _generate_readme(show_timeline, fountain_config)

    logger.info("JSON timeline generated: %d bytes, %d tracks", len(json_str), len(show_timeline.get("tracks", [])))

    return {
        "platform": "json_timeline",
        "files": [
            {
                "filename": filename,
                "content_type": "text",
                "content": json_str,
                "size_bytes": len(json_str.encode("utf-8")),
                "description": "Keyframed show timeline (JSON)",
            },
            {
                "filename": "PLAYBACK_INSTRUCTIONS.md",
                "content_type": "text",
                "content": readme,
                "size_bytes": len(readme.encode("utf-8")),
                "description": "Playback instructions",
            },
        ],
        "readme": readme,
        "storage_required_bytes": len(json_str.encode("utf-8")),
        "generated_at": show_timeline.get("metadata", {}).get("generated_at", ""),
    }


def _safe_filename(name: str) -> str:
    """Convert a song name to a safe filename.

    Args:
        name: Raw name string.

    Returns:
        Filename-safe string.
    """
    import re
    return re.sub(r"[^\w\-]", "_", name.lower())[:40]


def _generate_readme(
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
) -> str:
    """Generate playback instructions for the JSON timeline.

    Args:
        show_timeline: ShowTimeline dict.
        fountain_config: FountainConfig dict.

    Returns:
        Markdown string with instructions.
    """
    meta = show_timeline.get("metadata", {})
    duration_s = float(meta.get("duration_ms", 0)) / 1000.0
    frame_rate = meta.get("frame_rate", 40)
    track_count = len(show_timeline.get("tracks", []))

    return f"""# FountainFlow JSON Timeline Playback Instructions

## Show: {meta.get("song_name", "Unknown")}

- **Duration:** {duration_s:.1f} seconds
- **Frame rate:** {frame_rate} fps
- **Tracks:** {track_count}
- **Generated:** {meta.get("generated_at", "")}

## How to use this file

The timeline is a keyframed representation of all fountain actuator states.
To play it back, your controller must:

1. Parse the JSON file
2. For each track, read `keyframes` (sorted by `time_ms`)
3. At each point in time, interpolate between surrounding keyframes based on `easing`
4. Apply the interpolated values to your hardware

## Track types

- **`vfd`**: VFD pump speed (0–255, where 255 = max speed)
- **`valve`**: Solenoid valve (0 = closed, 255 = open)
- **`rgb_led`**: RGB LED group (`value_r`, `value_g`, `value_b` are 0–255 each)
- **`laser`**: Laser on/off (0 = off, 255 = on)

## Easing types

- `linear`: Interpolate linearly between keyframes
- `easeIn`: Slow start, fast end
- `easeOut`: Fast start, slow end
- `easeInOut`: Slow start and end
- `step`: No interpolation — jump instantly at the keyframe time

## Example playback pseudocode

```python
import json, time

with open("timeline.json") as f:
    show = json.load(f)

tracks = show["tracks"]
start_time = time.time()

while True:
    current_ms = (time.time() - start_time) * 1000
    for track in tracks:
        value = interpolate_keyframes(track["keyframes"], current_ms)
        apply_to_hardware(track["actuator_id"], value)
    time.sleep(1 / {frame_rate})
```
"""
