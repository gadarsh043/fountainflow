"""
DMX Art-Net binary generator — outputs .ffshow binary file.

Format:
  [Header: "FFSHOW" (6 bytes)]
  [Version: uint16 (2 bytes)]
  [Frame rate: uint16 (2 bytes)]
  [Universe count: uint8 (1 byte)]
  [Frame count: uint32 (4 bytes)]
  [Frame 0: [universe_0: 512 bytes] [universe_1: 512 bytes] ...]
  [Frame 1: ...]
  ...

Playable by any Art-Net controller software.
"""

from __future__ import annotations

import base64
import logging
import re
import struct
from typing import Any

logger = logging.getLogger(__name__)

FRAME_RATE = 40
DMX_UNIVERSE_SIZE = 512
HEADER_MAGIC = b"FFSHOW"


def generate_dmx_artnet(
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
) -> dict[str, Any]:
    """Generate a binary .ffshow Art-Net file.

    Args:
        show_timeline: ShowTimeline dict.
        fountain_config: FountainConfig dict.

    Returns:
        GenerationResult dict.
    """
    meta = show_timeline.get("metadata", {})
    song_name = meta.get("song_name", "show")
    duration_ms = float(meta.get("duration_ms", 0))
    frame_rate = int(meta.get("frame_rate", FRAME_RATE))
    tracks: list[dict[str, Any]] = show_timeline.get("tracks", [])

    # Determine how many universes are used
    max_universe = max(
        (int(t.get("dmx_universe", 1)) for t in tracks),
        default=1,
    )
    universe_count = max_universe

    total_frames = int(duration_ms / 1000.0 * frame_rate) + 1
    ms_per_frame = 1000.0 / frame_rate

    # Build per-frame, per-universe DMX data
    binary_data = _build_artnet_binary(
        tracks=tracks,
        total_frames=total_frames,
        universe_count=universe_count,
        ms_per_frame=ms_per_frame,
        frame_rate=frame_rate,
    )

    binary_b64 = base64.b64encode(binary_data).decode("ascii")
    safe_name = re.sub(r"[^\w\-]", "_", song_name.lower())[:30]
    filename = f"{safe_name}.ffshow"

    readme = _generate_readme(
        song_name=song_name,
        duration_ms=duration_ms,
        frame_rate=frame_rate,
        universe_count=universe_count,
        file_size_bytes=len(binary_data),
    )

    logger.info(
        "DMX Art-Net binary generated: %d bytes, %d frames, %d universes",
        len(binary_data),
        total_frames,
        universe_count,
    )

    return {
        "platform": "dmx_artnet",
        "files": [
            {
                "filename": filename,
                "content_type": "binary",
                "content_b64": binary_b64,
                "size_bytes": len(binary_data),
                "description": "Art-Net DMX show file (.ffshow)",
            },
            {
                "filename": "artnet_player.py",
                "content_type": "text",
                "content": _generate_python_player(filename),
                "size_bytes": len(_generate_python_player(filename).encode()),
                "description": "Python Art-Net playback script",
            },
            {
                "filename": "ARTNET_README.md",
                "content_type": "text",
                "content": readme,
                "size_bytes": len(readme.encode()),
                "description": "Art-Net setup instructions",
            },
        ],
        "readme": readme,
        "storage_required_bytes": len(binary_data),
        "generated_at": meta.get("generated_at", ""),
    }


def _build_artnet_binary(
    tracks: list[dict[str, Any]],
    total_frames: int,
    universe_count: int,
    ms_per_frame: float,
    frame_rate: int,
) -> bytes:
    """Build the complete binary file.

    Args:
        tracks: All timeline tracks.
        total_frames: Total frame count.
        universe_count: Number of DMX universes.
        ms_per_frame: Milliseconds per frame.
        frame_rate: Frames per second.

    Returns:
        Binary bytes.
    """
    from code_generation.csv_export import _interpolate_value, _interpolate_rgb

    # Header
    header = struct.pack(
        ">6sHHBI",
        HEADER_MAGIC,
        1,              # version
        frame_rate,
        universe_count,
        total_frames,
    )

    body = bytearray()

    for frame_idx in range(total_frames):
        t_ms = frame_idx * ms_per_frame

        # Initialize universe buffers (512 bytes each, all zeros)
        universes: list[bytearray] = [
            bytearray(DMX_UNIVERSE_SIZE) for _ in range(universe_count)
        ]

        for track in tracks:
            universe_idx = int(track.get("dmx_universe", 1)) - 1
            if universe_idx >= universe_count:
                continue
            dmx_ch = int(track.get("dmx_channel", 1)) - 1  # 0-indexed
            actuator_type = track.get("actuator_type", "generic")
            keyframes = track.get("keyframes", [])

            if actuator_type == "rgb_led":
                r, g, b = _interpolate_rgb(keyframes, t_ms)
                if 0 <= dmx_ch < DMX_UNIVERSE_SIZE:
                    universes[universe_idx][dmx_ch] = r
                if 0 <= dmx_ch + 1 < DMX_UNIVERSE_SIZE:
                    universes[universe_idx][dmx_ch + 1] = g
                if 0 <= dmx_ch + 2 < DMX_UNIVERSE_SIZE:
                    universes[universe_idx][dmx_ch + 2] = b
            else:
                v = _interpolate_value(keyframes, t_ms)
                if 0 <= dmx_ch < DMX_UNIVERSE_SIZE:
                    universes[universe_idx][dmx_ch] = max(0, min(255, v))

        for universe in universes:
            body.extend(universe)

    return header + bytes(body)


def _generate_python_player(ffshow_filename: str) -> str:
    """Generate a Python Art-Net playback script.

    Args:
        ffshow_filename: Name of the .ffshow file.

    Returns:
        Python script as a string.
    """
    return f'''#!/usr/bin/env python3
"""
FountainFlow Art-Net Player
Plays {ffshow_filename} via Art-Net UDP broadcast.

Usage:
    pip install pyartnet
    python artnet_player.py --file {ffshow_filename} --target 255.255.255.255
"""

import argparse
import socket
import struct
import time

ARTNET_PORT = 6454
ARTNET_OPCODE_OUTPUT = 0x5000
HEADER_SIZE = 15  # 6+2+2+1+4 bytes


def read_header(data: bytes) -> dict:
    magic, version, frame_rate, universe_count, frame_count = struct.unpack_from(">6sHHBI", data, 0)
    assert magic == b"FFSHOW", f"Invalid file magic: {{magic}}"
    return {{
        "version": version,
        "frame_rate": frame_rate,
        "universe_count": universe_count,
        "frame_count": frame_count,
    }}


def build_artnet_packet(universe: int, data: bytes) -> bytes:
    header = (
        b"Art-Net\\x00"          # ID
        + struct.pack("<H", ARTNET_OPCODE_OUTPUT)
        + b"\\x00\\x0e"           # Protocol version 14
        + b"\\x00"                # Sequence
        + b"\\x00"                # Physical
        + struct.pack("<H", universe)
        + struct.pack(">H", 512)  # Length
    )
    return header + data


def play(filename: str, target_ip: str) -> None:
    with open(filename, "rb") as f:
        raw = f.read()

    info = read_header(raw)
    frame_rate = info["frame_rate"]
    universe_count = info["universe_count"]
    frame_count = info["frame_count"]
    frame_size = 512 * universe_count
    frame_interval = 1.0 / frame_rate

    print(f"Playing {{filename}}: {{frame_count}} frames @ {{frame_rate}} fps, {{universe_count}} universes")

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    start = time.monotonic()
    for frame_idx in range(frame_count):
        frame_offset = HEADER_SIZE + frame_idx * frame_size
        for u in range(universe_count):
            u_data = raw[frame_offset + u * 512 : frame_offset + (u + 1) * 512]
            packet = build_artnet_packet(u, u_data)
            sock.sendto(packet, (target_ip, ARTNET_PORT))

        elapsed = time.monotonic() - start
        expected = (frame_idx + 1) * frame_interval
        sleep = expected - elapsed
        if sleep > 0:
            time.sleep(sleep)

    print("Show complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="{ffshow_filename}", help=".ffshow file path")
    parser.add_argument("--target", default="255.255.255.255", help="Art-Net target IP")
    args = parser.parse_args()
    play(args.file, args.target)
'''


def _generate_readme(
    song_name: str,
    duration_ms: float,
    frame_rate: int,
    universe_count: int,
    file_size_bytes: int,
) -> str:
    """Generate Art-Net setup README.

    Args:
        song_name: Song name.
        duration_ms: Duration in ms.
        frame_rate: Frame rate.
        universe_count: Number of universes.
        file_size_bytes: Binary file size.

    Returns:
        Markdown README string.
    """
    return f"""# FountainFlow — Art-Net DMX Setup

## Show: {song_name}
- **Duration:** {duration_ms / 1000:.1f} seconds
- **Frame rate:** {frame_rate} fps
- **DMX universes:** {universe_count}
- **File size:** {file_size_bytes / 1024 / 1024:.1f} MB

## Playback options

### Option 1: Python player (included)
```bash
pip install pyartnet
python artnet_player.py --file *.ffshow --target 255.255.255.255
```

### Option 2: QLC+
1. Open QLC+
2. Go to Show Manager → Import → FountainFlow (.ffshow)
   (Or use the Python player to feed Art-Net into QLC+'s Art-Net input)

### Option 3: Any Art-Net node
The .ffshow file contains raw DMX universes at {frame_rate} fps.
Use artnet_player.py to broadcast via UDP to your Art-Net nodes.

## Network setup
- Art-Net uses UDP port 6454
- Broadcast to 255.255.255.255 or your network's broadcast address
- Art-Net nodes must be on the same subnet as the player machine

## DMX channel assignments
See the JSON timeline file for detailed channel-to-actuator mapping.
Universe 1, channels 1-450: RGB LEDs (3 channels per fixture)
Universe 1, channels 451-488: Solenoid valves
Universe 1, channels 489-497: VFD pump speeds
Universe 2, channels 1-32: Lasers (if present)
"""
