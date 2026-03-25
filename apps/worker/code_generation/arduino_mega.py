"""
Arduino Mega generator — produces .ino sketch + binary SD card data.

IMPORTANT: The Mega has only 8 KB SRAM. Show data goes to SD card.
Binary format per frame: [uint32 timestamp_ms][uint8 channel_count][uint8... values]
The .ino sketch reads one frame per tick from the SD card.
"""

from __future__ import annotations

import base64
import logging
import re
import struct
from typing import Any

logger = logging.getLogger(__name__)

FRAME_RATE = 40  # fps
FRAME_INTERVAL_MS = 1000 // FRAME_RATE  # 25ms


def generate_arduino_mega(
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
) -> dict[str, Any]:
    """Generate Arduino Mega .ino sketch and binary SD card data.

    Args:
        show_timeline: ShowTimeline dict.
        fountain_config: FountainConfig dict.

    Returns:
        GenerationResult dict with .ino file and .bin file.
    """
    meta = show_timeline.get("metadata", {})
    song_name = meta.get("song_name", "show")
    duration_ms = float(meta.get("duration_ms", 0))
    tracks: list[dict[str, Any]] = show_timeline.get("tracks", [])
    nozzles: list[dict[str, Any]] = fountain_config.get("nozzles", [])
    leds: dict[str, Any] = fountain_config.get("leds", {})

    # Assign Arduino pins
    valve_pins, vfd_pins, led_pin = _assign_pins(nozzles, leds)

    # Expand timeline to dense frames
    frame_data = _expand_to_frames(show_timeline)

    # Build binary SD card data
    binary_data = _build_binary_data(frame_data)
    binary_b64 = base64.b64encode(binary_data).decode("ascii")

    # Generate .ino sketch
    ino_code = _generate_ino(
        song_name=song_name,
        duration_ms=int(duration_ms),
        valve_pins=valve_pins,
        vfd_pins=vfd_pins,
        led_pin=led_pin,
        frame_count=len(frame_data),
        channel_count=len(frame_data[0]) if frame_data else 0,
        meta=meta,
    )

    safe_name = re.sub(r"[^\w\-]", "_", song_name.lower())[:30]
    readme = _generate_readme(song_name, valve_pins, vfd_pins, led_pin, binary_data)

    return {
        "platform": "arduino_mega",
        "files": [
            {
                "filename": f"{safe_name}_fountain.ino",
                "content_type": "text",
                "content": ino_code,
                "size_bytes": len(ino_code.encode()),
                "description": "Arduino Mega sketch",
            },
            {
                "filename": "show_data.bin",
                "content_type": "binary",
                "content_b64": binary_b64,
                "size_bytes": len(binary_data),
                "description": "SD card show data (copy to SD card root as show_data.bin)",
            },
            {
                "filename": "WIRING_INSTRUCTIONS.md",
                "content_type": "text",
                "content": readme,
                "size_bytes": len(readme.encode()),
                "description": "Wiring instructions",
            },
        ],
        "readme": readme,
        "storage_required_bytes": len(binary_data),
        "generated_at": meta.get("generated_at", ""),
    }


def _assign_pins(
    nozzles: list[dict[str, Any]],
    leds: dict[str, Any],
) -> tuple[dict[str, int], dict[str, int], int]:
    """Assign Arduino digital/PWM pins to valves and VFDs.

    Arduino Mega has 54 digital I/O pins (22–53 recommended for relays).
    PWM pins: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46.

    Args:
        nozzles: List of NozzleConfig dicts.
        leds: LEDConfig dict.

    Returns:
        (valve_pins dict, vfd_pins dict, led_data_pin int)
    """
    valve_pins: dict[str, int] = {}
    vfd_pins: dict[str, int] = {}

    valve_pin = 22   # Start at pin 22
    pwm_pins = [2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46]
    pwm_idx = 0

    for nozzle in nozzles:
        nozzle_id = nozzle["id"]
        count = int(nozzle.get("count", 1))
        for i in range(count):
            key = f"{nozzle_id}_{i + 1:02d}" if count > 1 else nozzle_id
            valve_pins[key] = valve_pin
            valve_pin += 1

    # Assign PWM pins to VFDs (pumps that are VFD-controlled)
    for nozzle in nozzles:
        nozzle_id = nozzle["id"]
        if pwm_idx < len(pwm_pins):
            vfd_pins[nozzle_id] = pwm_pins[pwm_idx]
            pwm_idx += 1

    led_pin = 6  # NeoPixel data pin (PWM-capable)

    return valve_pins, vfd_pins, led_pin


def _expand_to_frames(
    show_timeline: dict[str, Any],
) -> list[list[int]]:
    """Expand keyframes to dense per-frame values (40fps).

    Returns a list of frames, each frame is a list of uint8 channel values.
    Channel order: [valves...] [vfds...] [led_r, led_g, led_b...]

    Args:
        show_timeline: ShowTimeline dict.

    Returns:
        List of frames (each frame is a list of 0–255 values).
    """
    from code_generation.csv_export import _interpolate_value, _interpolate_rgb

    meta = show_timeline.get("metadata", {})
    duration_ms = float(meta.get("duration_ms", 0))
    frame_rate = int(meta.get("frame_rate", FRAME_RATE))
    total_frames = int(duration_ms / 1000.0 * frame_rate) + 1
    tracks: list[dict[str, Any]] = show_timeline.get("tracks", [])

    # Separate valve, vfd, and led tracks in a stable order
    valve_tracks = [t for t in tracks if t.get("actuator_type") == "valve"]
    vfd_tracks = [t for t in tracks if t.get("actuator_type") == "vfd"]
    led_tracks = [t for t in tracks if t.get("actuator_type") == "rgb_led"]

    frames: list[list[int]] = []
    ms_per_frame = 1000.0 / frame_rate

    for frame_idx in range(total_frames):
        t_ms = frame_idx * ms_per_frame
        frame: list[int] = []

        for track in valve_tracks:
            v = _interpolate_value(track.get("keyframes", []), t_ms)
            # Valve is binary: > 127 = open (1), else closed (0)
            frame.append(1 if v > 127 else 0)

        for track in vfd_tracks:
            v = _interpolate_value(track.get("keyframes", []), t_ms)
            frame.append(max(0, min(255, v)))

        for track in led_tracks:
            r, g, b = _interpolate_rgb(track.get("keyframes", []), t_ms)
            frame.extend([r, g, b])

        frames.append(frame)

    return frames


def _build_binary_data(frame_data: list[list[int]]) -> bytes:
    """Build binary SD card data from frame list.

    Format: [header][frame0][frame1]...
    Header: magic(6) + version(2) + frame_rate(2) + channel_count(1) + frame_count(4)
    Frame: channel values as uint8 bytes

    Args:
        frame_data: List of frames, each a list of uint8 values.

    Returns:
        Binary bytes to write to SD card.
    """
    if not frame_data:
        return b""

    channel_count = len(frame_data[0])
    frame_count = len(frame_data)

    # Header: "FFSHOW" + version(1) + frame_rate(40) + channel_count + frame_count
    header = struct.pack(
        ">6sHHBI",
        b"FFSHOW",
        1,               # version
        FRAME_RATE,
        channel_count,
        frame_count,
    )

    body = bytearray()
    for frame in frame_data:
        for v in frame:
            body.append(max(0, min(255, int(v))))

    return header + bytes(body)


def _generate_ino(
    song_name: str,
    duration_ms: int,
    valve_pins: dict[str, int],
    vfd_pins: dict[str, int],
    led_pin: int,
    frame_count: int,
    channel_count: int,
    meta: dict[str, Any],
) -> str:
    """Generate the Arduino Mega .ino sketch.

    Args:
        song_name: Song name for header comment.
        duration_ms: Show duration in ms.
        valve_pins: Map of valve name → pin number.
        vfd_pins: Map of VFD name → pin number.
        led_pin: NeoPixel data pin.
        frame_count: Total number of frames.
        channel_count: Channels per frame.
        meta: ShowTimeline metadata.

    Returns:
        .ino source code as a string.
    """
    valve_pin_list = ", ".join(str(p) for p in valve_pins.values())
    vfd_pin_list = ", ".join(str(p) for p in vfd_pins.values())
    valve_count = len(valve_pins)
    vfd_count = len(vfd_pins)

    return f"""// AUTO-GENERATED by FountainFlow — do not edit manually
// Song: {song_name}
// Duration: {duration_ms} ms
// Generated: {meta.get("generated_at", "")}
// Fountain: {meta.get("fountain_config_hash", "")[:8]}
//
// WIRING:
//   Valve relays: pins {valve_pin_list}
//   VFD PWM:      pins {vfd_pin_list}
//   NeoPixel:     pin  {led_pin}
//   SD Card CS:   pin  53 (SPI)
//
// SETUP: Copy show_data.bin to the root of the SD card before use.

#include <SD.h>
#include <SPI.h>
#include <Adafruit_NeoPixel.h>

// ── Pin assignments ──────────────────────────────────────────────────────
const int VALVE_PINS[{valve_count}]  = {{{valve_pin_list}}};
const int VFD_PINS[{vfd_count}]    = {{{vfd_pin_list}}};
const int LED_DATA_PIN = {led_pin};
const int SD_CS_PIN    = 53;

// ── Show parameters ──────────────────────────────────────────────────────
const int   FRAME_RATE      = 40;           // fps
const long  FRAME_INTERVAL  = 25L;          // ms per frame (1000/40)
const int   CHANNEL_COUNT   = {channel_count};
const long  FRAME_COUNT     = {frame_count}L;
const int   VALVE_COUNT     = {valve_count};
const int   VFD_COUNT       = {vfd_count};

// ── NeoPixel ─────────────────────────────────────────────────────────────
// LED_COUNT is (CHANNEL_COUNT - VALVE_COUNT - VFD_COUNT) / 3
const int LED_COUNT = max(0, (CHANNEL_COUNT - VALVE_COUNT - VFD_COUNT) / 3);
Adafruit_NeoPixel strip(LED_COUNT > 0 ? LED_COUNT : 1, LED_DATA_PIN, NEO_GRB + NEO_KHZ800);

// ── Runtime state ────────────────────────────────────────────────────────
File showFile;
uint8_t frameBuffer[{channel_count}];
long currentFrame = 0;
unsigned long frameStartMs = 0;

void setup() {{
  Serial.begin(115200);
  Serial.println(F("FountainFlow Arduino — initializing"));

  // Initialize valve pins
  for (int i = 0; i < VALVE_COUNT; i++) {{
    pinMode(VALVE_PINS[i], OUTPUT);
    digitalWrite(VALVE_PINS[i], LOW);
  }}

  // Initialize VFD PWM pins
  for (int i = 0; i < VFD_COUNT; i++) {{
    pinMode(VFD_PINS[i], OUTPUT);
    analogWrite(VFD_PINS[i], 0);
  }}

  // Initialize NeoPixel
  strip.begin();
  strip.clear();
  strip.show();

  // Initialize SD card
  if (!SD.begin(SD_CS_PIN)) {{
    Serial.println(F("ERROR: SD card init failed! Check wiring."));
    blinkError(3);
    return;
  }}

  // Open show file
  showFile = SD.open("show_data.bin", FILE_READ);
  if (!showFile) {{
    Serial.println(F("ERROR: show_data.bin not found on SD card!"));
    blinkError(5);
    return;
  }}

  // Skip binary header (6+2+2+1+4 = 15 bytes)
  showFile.seek(15);

  Serial.println(F("Ready. Send any character to start show."));
  while (!Serial.available()) delay(10);
  while (Serial.available()) Serial.read();

  Serial.println(F("Show starting!"));
  frameStartMs = millis();
}}

void loop() {{
  if (currentFrame >= FRAME_COUNT) {{
    // Show complete — reset all outputs
    stopAll();
    Serial.println(F("Show complete."));
    while (true) delay(1000);
  }}

  unsigned long now = millis();
  long expectedFrame = (long)((now - frameStartMs) / FRAME_INTERVAL);

  if (expectedFrame <= currentFrame) {{
    // Not yet time for next frame
    return;
  }}

  // Catch up if we missed frames (should rarely happen)
  long framesToSkip = expectedFrame - currentFrame - 1;
  if (framesToSkip > 0 && framesToSkip < 10) {{
    showFile.seek(15 + (long)(currentFrame + 1) * CHANNEL_COUNT);
    currentFrame += framesToSkip;
  }}

  // Read next frame
  if (showFile.read(frameBuffer, CHANNEL_COUNT) != CHANNEL_COUNT) {{
    Serial.println(F("ERROR: Read failed — resetting"));
    showFile.seek(15);
    currentFrame = 0;
    return;
  }}
  currentFrame++;

  // Apply frame: valves
  for (int i = 0; i < VALVE_COUNT; i++) {{
    digitalWrite(VALVE_PINS[i], frameBuffer[i] ? HIGH : LOW);
  }}

  // Apply frame: VFDs (PWM, 0-255)
  for (int i = 0; i < VFD_COUNT; i++) {{
    analogWrite(VFD_PINS[i], frameBuffer[VALVE_COUNT + i]);
  }}

  // Apply frame: LEDs (RGB triplets)
  if (LED_COUNT > 0) {{
    int ledOffset = VALVE_COUNT + VFD_COUNT;
    for (int i = 0; i < LED_COUNT; i++) {{
      int base = ledOffset + i * 3;
      strip.setPixelColor(i,
        frameBuffer[base],
        frameBuffer[base + 1],
        frameBuffer[base + 2]
      );
    }}
    strip.show();
  }}
}}

void stopAll() {{
  for (int i = 0; i < VALVE_COUNT; i++) digitalWrite(VALVE_PINS[i], LOW);
  for (int i = 0; i < VFD_COUNT; i++) analogWrite(VFD_PINS[i], 0);
  strip.clear(); strip.show();
}}

void blinkError(int count) {{
  for (int i = 0; i < count; i++) {{
    digitalWrite(LED_BUILTIN, HIGH); delay(300);
    digitalWrite(LED_BUILTIN, LOW);  delay(300);
  }}
}}
"""


def _generate_readme(
    song_name: str,
    valve_pins: dict[str, int],
    vfd_pins: dict[str, int],
    led_pin: int,
    binary_data: bytes,
) -> str:
    """Generate wiring instructions.

    Args:
        song_name: Song name.
        valve_pins: Valve → pin mapping.
        vfd_pins: VFD → pin mapping.
        led_pin: LED data pin.
        binary_data: Generated binary (for size display).

    Returns:
        Markdown instructions string.
    """
    wiring_lines = "\n".join(
        f"  - {name}: Pin {pin}" for name, pin in valve_pins.items()
    )
    vfd_lines = "\n".join(
        f"  - {name}: Pin {pin}" for name, pin in vfd_pins.items()
    )

    return f"""# FountainFlow — Arduino Mega Setup

## Song: {song_name}
## SD card data size: {len(binary_data):,} bytes ({len(binary_data) / 1024:.1f} KB)

## Required libraries (install via Arduino IDE Library Manager)
- Adafruit NeoPixel
- SD (built-in)
- SPI (built-in)

## Steps
1. Copy `show_data.bin` to the **root** of a FAT32-formatted SD card
2. Insert SD card into the SD module connected to Mega SPI (pins 50-53)
3. Open `*_fountain.ino` in Arduino IDE
4. Select: Tools → Board → Arduino Mega 2560
5. Select the correct COM port
6. Upload the sketch
7. Open Serial Monitor at 115200 baud
8. Send any character to start the show

## Wiring — Valve relay pins (HIGH = open)
{wiring_lines}

## Wiring — VFD PWM pins (0-255 → 0-10V via low-pass filter)
{vfd_lines}

## Wiring — LED strip (NeoPixel/WS2812B)
  - Data: Pin {led_pin}

## Wiring — SD card module (SPI)
  - MISO: Pin 50
  - MOSI: Pin 51
  - SCK:  Pin 52
  - CS:   Pin 53

## ⚠️  Safety notes
- Never exceed 5A on relay modules; use industrial relays for large solenoids
- Add 0.1µF capacitors on VFD PWM outputs to prevent EMI interference
- Connect fountain earth ground to controller GND
"""
