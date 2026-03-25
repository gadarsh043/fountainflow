"""
Modbus RTU sequence generator — for VFD speed control.

Outputs a CSV of Modbus write commands (Function Code 06 — Write Single Register):
  timestamp_ms, slave_address, register_address, value

Uses generic register addresses. Installer must customize for their VFD brand.
Common VFD speed reference registers:
  Danfoss FC51/FC102:  Register 1-01 → 01601 (decimal)
  ABB ACS355:          Register 1 (speed setpoint in rpm/hz)
  Siemens MM440:       Parameter P1120 reference
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

FRAME_RATE = 40

# Default Modbus speed reference register per VFD brand
# Installer should update for their specific model
DEFAULT_SPEED_REGISTER = 8192  # Generic "speed setpoint" holding register


def generate_modbus_sequence(
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
) -> dict[str, Any]:
    """Generate Modbus RTU command sequence for VFD speed control.

    Args:
        show_timeline: ShowTimeline dict.
        fountain_config: FountainConfig dict.

    Returns:
        GenerationResult dict.
    """
    meta = show_timeline.get("metadata", {})
    song_name = meta.get("song_name", "show")
    duration_ms = float(meta.get("duration_ms", 0))
    tracks: list[dict[str, Any]] = show_timeline.get("tracks", [])
    pumps: list[dict[str, Any]] = fountain_config.get("pumps", [])

    # Build Modbus slave address map from pump config
    pump_modbus: dict[str, int] = {}
    for pump in pumps:
        if pump.get("vfd_controlled") and pump.get("vfd_modbus_address"):
            pump_id = pump["id"]
            pump_modbus[pump_id] = int(pump["vfd_modbus_address"])

    vfd_tracks = [t for t in tracks if t.get("actuator_type") == "vfd"]

    output = io.StringIO()
    output.write("# FountainFlow Modbus RTU Command Sequence\n")
    output.write(f"# Song: {song_name}\n")
    output.write(f"# Duration: {duration_ms / 1000:.1f}s\n")
    output.write(f"# Generated: {meta.get('generated_at', '')}\n")
    output.write("#\n")
    output.write("# IMPORTANT: Customize slave_address and register_address for your VFD brand\n")
    output.write("# See: docs/supported-hardware.md for VFD register references\n")
    output.write("#\n")
    output.write("timestamp_ms,slave_address,register_address,value_raw,value_hz,actuator_id\n")

    from code_generation.csv_export import _interpolate_value

    # Only emit Modbus commands when VFD value changes (sparse)
    ms_per_frame = 1000.0 / FRAME_RATE

    for track in vfd_tracks:
        actuator_id = str(track.get("actuator_id", ""))
        keyframes = track.get("keyframes", [])
        # Find matching pump (strip "vfd_" prefix)
        base_id = actuator_id.replace("vfd_", "", 1)
        slave_addr = pump_modbus.get(base_id, 1)

        last_value = -1
        for kf in keyframes:
            t_ms = float(kf.get("time_ms", 0))
            v = int(kf.get("value", 0))

            if abs(v - last_value) < 3:
                continue  # Skip near-duplicate values
            last_value = v

            # Convert DMX 0-255 to Hz (0-50Hz)
            hz = round(v / 255.0 * 50.0, 2)
            # Modbus value: 0-50Hz in 0.01 Hz increments → 0-5000
            modbus_val = int(hz * 100)

            output.write(f"{t_ms:.1f},{slave_addr},{DEFAULT_SPEED_REGISTER},{modbus_val},{hz},{actuator_id}\n")

    csv_str = output.getvalue()
    safe_name = re.sub(r"[^\w\-]", "_", song_name.lower())[:30]

    readme = f"""# FountainFlow Modbus RTU Sequence

## Song: {song_name}

## Format
`timestamp_ms, slave_address, register_address, value_raw, value_hz, actuator_id`

- **timestamp_ms**: Send this Modbus command at this time (relative to show start)
- **slave_address**: Modbus slave address of the VFD (1-247)
- **register_address**: Holding register for speed setpoint ({DEFAULT_SPEED_REGISTER})
- **value_raw**: Register value (0-5000 = 0-50 Hz in 0.01 Hz steps)
- **value_hz**: Speed in Hz (for reference)

## Customize for your VFD brand

| Brand | Speed register | Scale |
|-------|---------------|-------|
| Danfoss FC51/FC102 | 49601 | 0-32767 = 0-100% |
| ABB ACS355 | 1 | 0-20000 = 0-50 Hz |
| Siemens MM440 | 1120 | 0-16384 = 0-50 Hz |
| Schneider ATV312 | 8501 | 0-500 = 0-50 Hz |

Update `register_address` and `value_raw` in this CSV accordingly.

## Playback
Use any Modbus RTU master software (e.g., Modscan, Simply Modbus)
to replay these commands from a serial RS-485 port at 9600/19200 baud.
"""

    return {
        "platform": "modbus",
        "files": [
            {
                "filename": f"{safe_name}_modbus.csv",
                "content_type": "text",
                "content": csv_str,
                "size_bytes": len(csv_str.encode()),
                "description": "Modbus RTU command sequence",
            },
            {
                "filename": "MODBUS_README.md",
                "content_type": "text",
                "content": readme,
                "size_bytes": len(readme.encode()),
                "description": "Modbus setup instructions",
            },
        ],
        "readme": readme,
        "storage_required_bytes": len(csv_str.encode()),
        "generated_at": meta.get("generated_at", ""),
    }
