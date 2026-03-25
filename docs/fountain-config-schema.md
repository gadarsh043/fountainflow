# Fountain Configuration Schema

The `FountainConfig` object describes your fountain hardware. This is what you provide when creating a project.

---

## Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Display name for this configuration |
| `dimensions` | object | ✓ | Physical pool dimensions in feet |
| `nozzles` | NozzleConfig[] | ✓ | Array of nozzle group configurations |
| `pumps` | PumpConfig[] | ✓ | Array of pump configurations |
| `valves` | ValveConfig | ✓ | Valve timing constraints |
| `leds` | LEDConfig | ✓ | RGB LED configuration |
| `lasers` | LaserConfig | — | Optional laser configuration |
| `target_platform` | string | ✓ | Code generation target |

---

## NozzleConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique ID (e.g., `"center_jet"`) |
| `type` | NozzleType | ✓ | One of 13 supported types (see below) |
| `count` | number | ✓ | Number of nozzles in this group |
| `max_height_ft` | number | ✓ | Maximum jet height in feet |
| `spread_angle_deg` | number | — | Fan/peacock spread angle (0=vertical) |
| `positions` | `{x,y}[]` | — | XY positions in feet from center |

### Supported nozzle types

| Type | Description |
|------|-------------|
| `center_jet` | Single tall central jet |
| `high_jet` | Multiple tall jets |
| `ring_fountain` | Circular ring of jets |
| `peacock_tail` | Fan-shaped curved jets |
| `rising_sun` | Jets arranged in sunrise pattern |
| `revolving` | Rotating jets |
| `butterfly` | Symmetric arching jets |
| `moving_head` | Motorized directional jet |
| `organ_fountain` | Graduated height jets in a row |
| `corner_jet` | Corner-positioned jets |
| `mist_line` | Low-pressure mist nozzles |
| `water_screen` | Flat water screen for projection |
| `fan_jet` | Wide angle fan spray |

---

## PumpConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique ID (e.g., `"pump_main"`) |
| `hp` | number | ✓ | Motor horsepower |
| `feeds` | string[] | ✓ | Nozzle group IDs fed by this pump |
| `vfd_controlled` | boolean | ✓ | Whether speed is VFD-controllable |
| `vfd_modbus_address` | number | — | Modbus RTU address (VFD only) |
| `dmx_channel_speed` | number | — | Auto-assigned during config |
| `dmx_channel_enable` | number | — | Auto-assigned during config |

---

## ValveConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `count` | number | — | Total number of solenoid valves |
| `min_cycle_ms` | number | 200 | Minimum open/close cycle time |
| `min_close_time_large_pipe_ms` | number | 300 | For pipes > 2 inch (water hammer) |
| `max_frequency_hz` | number | 5 | Maximum switching frequency |

---

## LEDConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `count` | number | ✓ | Total RGB LED fixtures |
| `type` | `"rgb"` \| `"rgbw"` \| `"single_color"` | ✓ | LED type |
| `channels_per_fixture` | number | ✓ | DMX channels per fixture (3 for RGB) |
| `dmx_channel_start` | number | ✓ | Starting DMX channel (1-indexed) |
| `dmx_universe` | number | ✓ | DMX universe (1-indexed) |
| `groups` | `{id, name, led_indices}[]` | — | Zone groupings for color control |

---

## Target platforms

| Value | Description | Output |
|-------|-------------|--------|
| `arduino_mega` | Arduino Mega 2560 | `.ino` file + `.bin` (SD card data) |
| `esp32` | ESP32 (WROOM/WROVER) | `.ino` file + SPIFFS data |
| `dmx_artnet` | Art-Net DMX controller | `.ffshow` binary file |
| `json_timeline` | Custom controller | Keyframed `.json` timeline |
| `csv` | PLC / spreadsheet | `.csv` with timestamp/channel/value |
| `modbus` | VFD Modbus RTU | Modbus command sequence |

---

## Example configuration (small garden fountain)

```json
{
  "name": "Garden Fountain",
  "dimensions": { "length_ft": 10, "width_ft": 8 },
  "nozzles": [
    {
      "id": "center_jet",
      "type": "center_jet",
      "count": 1,
      "max_height_ft": 6
    },
    {
      "id": "ring",
      "type": "ring_fountain",
      "count": 1,
      "max_height_ft": 3
    }
  ],
  "pumps": [
    {
      "id": "pump_1",
      "hp": 0.75,
      "feeds": ["center_jet", "ring"],
      "vfd_controlled": false
    }
  ],
  "valves": {
    "count": 3,
    "min_cycle_ms": 200,
    "min_close_time_large_pipe_ms": 200,
    "max_frequency_hz": 5
  },
  "leds": {
    "count": 8,
    "type": "rgb",
    "channels_per_fixture": 3,
    "dmx_channel_start": 1,
    "dmx_universe": 1
  },
  "target_platform": "arduino_mega"
}
```
