# Supported Hardware

FountainFlow generates code for a wide range of fountain control hardware.

---

## Microcontrollers

### Arduino Mega 2560
- 54 digital I/O pins, 15 PWM
- 8 KB SRAM, 256 KB flash
- **Show data stored on SD card** (frame-by-frame binary, FAT32)
- Use SPI pins: 50 (MISO), 51 (MOSI), 52 (SCK), 53 (CS)
- Compatible with: Relay modules, L298N motor drivers, NeoPixel strips
- **Max show complexity:** Up to 50 channels (with shift registers for pin expansion)
- **Timing precision:** ~1ms (millis()), typical drift < 2s over 5 minutes

### ESP32 (WROOM/WROVER)
- 34 GPIO pins (many PWM-capable)
- 520 KB SRAM, 4 MB flash
- **Show data stored in SPIFFS** (up to ~3MB for ~8-min show at 40fps)
- WiFi-triggered start: connect via HTTP to `http://esp32.local/start`
- Dual-core: Core 0 for playback, Core 1 for WiFi/LED updates
- **Max show complexity:** Same as Arduino but with more RAM for buffering

---

## DMX Controllers (Art-Net / sACN)

The generated `.ffshow` binary file can be played by:

| Software | Platform | Notes |
|----------|----------|-------|
| DMX Workshop | Windows | Requires Art-Net network adapter |
| QLC+ | Win/Mac/Linux | Open source, supports Art-Net natively |
| MA Lighting grandMA | Hardware | Professional touring console |
| Onyx (Obsidian) | Windows | Supports Art-Net, sACN |
| Custom Node.js/Python script | Any | Provided in download ZIP |

**Requirements:**
- Any network-connected Art-Net node (e.g., Enttec ODE, Artistic Licence, LumenRadio)
- 1 Gbps network recommended for > 2 universes
- Clock synchronization if multiple controllers

---

## VFD (Variable Frequency Drive) Control

FountainFlow generates Modbus RTU command sequences. Tested with:

| Brand | Series | Notes |
|-------|--------|-------|
| Danfoss | FC51, FC102 | Register 1-01 for speed reference |
| ABB | ACS355, ACS880 | Register 1 (speed setpoint) |
| Siemens | Micromaster 440 | Parameter P1120 for ramp |
| Schneider | Altivar 312 | Register ATV_W_CMD_4006 |

**Important:** The generated Modbus code uses generic register addresses. You must customize the register map for your specific VFD model. See the `WIRING_INSTRUCTIONS.md` in the generated ZIP.

---

## RGB LED Systems

| System | Interface | Notes |
|--------|-----------|-------|
| WS2812B / NeoPixel | 1-wire serial | 1 data pin, up to 500+ LEDs per pin |
| SK6812 (RGBW) | 1-wire serial | 4-channel (adds white) |
| DMX RGB fixtures | RS-485 (DMX512) | 3 channels per fixture, standard protocol |
| Meanwell LED drivers | 0-10V analog | Requires DAC (MCP4725 on Arduino) |

FountainFlow generates NeoPixel-compatible code by default for Arduino/ESP32. For DMX-controlled LEDs, use the Art-Net output.

---

## Recommended components (hobbyist setup)

| Component | Suggested model | ~Price |
|-----------|----------------|--------|
| Microcontroller | Arduino Mega 2560 | $20 |
| Relay module | 8-channel 5V relay | $10 |
| Solenoid valves | 12V 1/2" brass solenoid | $8 each |
| LED strip | WS2812B 60 LEDs/m | $12/m |
| Submersible pump | 400-600 GPH 12V | $25 |
| SD card module | MicroSD SPI module | $5 |
| Power supply | 12V 10A switching | $20 |
| Waterproof enclosure | IP65 junction box | $15 |

**Total for 5-nozzle hobbyist fountain: ~$150-200**

---

## Wiring guide (Arduino Mega — 5-nozzle example)

```
Arduino Mega
├── Pin 22 → Relay 1 → Valve 1 (center jet)
├── Pin 23 → Relay 2 → Valve 2 (ring - left)
├── Pin 24 → Relay 3 → Valve 3 (ring - right)
├── Pin 25 → Relay 4 → Valve 4 (corner - left)
├── Pin 26 → Relay 5 → Valve 5 (corner - right)
├── Pin 6  → NeoPixel data → LED strip
├── Pin 53 → SD card CS
├── Pin 52 → SD card SCK
├── Pin 51 → SD card MOSI
├── Pin 50 → SD card MISO
└── Pin 7  → Audio trigger (active HIGH to start MP3 player)
```

All relay modules require a separate 12V power supply for the solenoids.
