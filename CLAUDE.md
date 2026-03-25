# CLAUDE.md — Autonomous Development Guide for FountainFlow

This file is the operating manual for Claude Code working on this project. It enables fully autonomous development without human interaction. Read this ENTIRE file before starting any task.

---

## 1. Project identity

**FountainFlow** is a SaaS platform that converts music into fountain choreography code. Users upload a song + fountain hardware config → system outputs downloadable control code + browser-based 3D simulation.

**You are building ALL of this.** The human developer will review your work, not guide you step-by-step.

---

## 2. Repository structure

```
fountainflow/
├── CLAUDE.md                    # THIS FILE — your operating manual
├── README.md                    # How to set up and run the project
├── product_spec.md              # Full product specification
├── design_decisions.md          # Why we chose what we chose
├── limitations.md               # Known limitations and constraints
├── next_steps.md                # Things that need human action
├── .env.example                 # Required environment variables
├── docker-compose.yml           # Local development stack
├── turbo.json                   # Turborepo config
├── packages/
│   └── shared/                  # Shared TypeScript types
│       ├── src/
│       │   ├── types/
│       │   │   ├── fountain-config.ts
│       │   │   ├── audio-analysis.ts
│       │   │   ├── timeline.ts
│       │   │   └── code-generation.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   ├── web/                     # Next.js 14 frontend
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx         # Landing page
│   │   │   ├── dashboard/
│   │   │   ├── project/[id]/
│   │   │   └── api/             # Next.js API routes (proxy to API server)
│   │   ├── components/
│   │   │   ├── fountain-3d/     # React Three Fiber components
│   │   │   │   ├── FountainScene.tsx
│   │   │   │   ├── ParticleJet.tsx
│   │   │   │   ├── WaterParticleSystem.tsx
│   │   │   │   ├── RGBLightSystem.tsx
│   │   │   │   └── AudioSyncPlayer.tsx
│   │   │   ├── upload/
│   │   │   ├── config-wizard/
│   │   │   └── timeline-viewer/
│   │   ├── lib/
│   │   │   ├── audio-context.ts
│   │   │   └── timeline-player.ts
│   │   └── package.json
│   ├── api/                     # NestJS API server
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── projects/
│   │   │   ├── jobs/
│   │   │   ├── auth/
│   │   │   └── storage/
│   │   └── package.json
│   └── worker/                  # Python audio/choreography worker
│       ├── main.py              # FastAPI app entry point
│       ├── requirements.txt
│       ├── Dockerfile
│       ├── audio_analysis/
│       │   ├── __init__.py
│       │   ├── pipeline.py      # Main analysis orchestrator
│       │   ├── beat_tracker.py  # madmom RNN beat tracking
│       │   ├── band_extractor.py # 6-band frequency decomposition
│       │   ├── section_detector.py # MSAF segmentation
│       │   ├── onset_detector.py
│       │   ├── energy_analyzer.py
│       │   └── song_boundary.py # Silence detection for stitched files
│       ├── choreography/
│       │   ├── __init__.py
│       │   ├── engine.py        # Main choreography orchestrator
│       │   ├── section_themes.py # Layer 1: section → theme
│       │   ├── beat_scheduler.py # Layer 2: beat → valve timing
│       │   ├── energy_mapper.py  # Layer 3: energy → VFD speed
│       │   ├── color_engine.py   # RGB LED color choreography
│       │   ├── aesthetic_rules.py # Symmetry, min hold, crescendo, etc.
│       │   ├── safety.py         # Valve timing, VFD ramp constraints
│       │   └── templates/        # Predefined choreography patterns
│       │       ├── intro_subtle.py
│       │       ├── verse_rhythmic.py
│       │       ├── chorus_spectacle.py
│       │       ├── bridge_unique.py
│       │       └── outro_winddown.py
│       ├── code_generation/
│       │   ├── __init__.py
│       │   ├── generator.py      # Main generator dispatcher
│       │   ├── arduino_mega.py
│       │   ├── esp32.py
│       │   ├── dmx_artnet.py
│       │   ├── json_timeline.py
│       │   ├── csv_export.py
│       │   └── modbus_sequence.py
│       └── tests/
│           ├── test_audio_pipeline.py
│           ├── test_choreography.py
│           ├── test_code_generation.py
│           └── fixtures/         # Test audio files (short clips)
└── docs/
    ├── api-reference.md
    ├── fountain-config-schema.md
    └── supported-hardware.md
```

---

## 3. How to work autonomously

### 3.1 Before starting any task

1. Read the relevant section of `product_spec.md`
2. Check `design_decisions.md` for architectural context
3. Check `limitations.md` to avoid known pitfalls
4. Check `next_steps.md` — the task may already be listed there
5. Look at existing code to understand current state

### 3.2 Decision-making framework

When you face a design choice, apply these rules IN ORDER:

1. **Does product_spec.md already specify this?** → Follow it.
2. **Does design_decisions.md address this?** → Follow it.
3. **Is there a well-established industry standard?** → Use it (e.g., DMX512 for lighting, Art-Net for network transport).
4. **Is there a library that solves this well?** → Use the library, don't build from scratch.
5. **None of the above?** → Choose the simpler option. Document your decision by appending to `design_decisions.md`.

### 3.3 When something fails

1. Read the error message completely
2. Check if it's a known limitation (see `limitations.md`)
3. Try the fix — if it involves changing architecture or a major dependency, document WHY in `design_decisions.md`
4. If you cannot fix it, add it to `next_steps.md` under "Needs human review" with full context
5. NEVER silently skip a broken feature — either fix it or document it

### 3.4 Self-learning pattern

After completing each major component, append a section to this file:

```markdown
### Lesson: [component name] — [date]
**What worked:** ...
**What failed initially:** ...
**Key insight:** ...
**If rebuilding, I would:** ...
```

This creates institutional memory for future development sessions.

---

## 4. Coding standards

### 4.1 Python (worker)

```python
# Python 3.11+, type hints required on all functions
# Use numpy typing for array params

import numpy as np
from numpy.typing import NDArray

def extract_band_energy(
    spectrogram: NDArray[np.float32],
    frequencies: NDArray[np.float32],
    low_hz: float,
    high_hz: float,
) -> NDArray[np.float32]:
    """Extract mean energy in a frequency band.
    
    Args:
        spectrogram: STFT magnitude spectrogram, shape (n_freq, n_frames)
        frequencies: Frequency bin centers in Hz, shape (n_freq,)
        low_hz: Lower frequency bound (inclusive)
        high_hz: Upper frequency bound (exclusive)
    
    Returns:
        Mean energy per frame, shape (n_frames,)
    """
    mask = (frequencies >= low_hz) & (frequencies < high_hz)
    return np.mean(spectrogram[mask, :] ** 2, axis=0)
```

**Rules:**
- Every function has a docstring with Args/Returns
- Type hints on every parameter and return
- No global mutable state
- Config values come from environment or function params, never hardcoded
- Use `logging` module, not `print()`
- Test files mirror source structure: `audio_analysis/pipeline.py` → `tests/test_audio_pipeline.py`

### 4.2 TypeScript (frontend + API)

```typescript
// Strict mode, no `any` types, named exports preferred

export interface FountainConfig {
  id: string;
  name: string;
  dimensions: { length_ft: number; width_ft: number };
  nozzles: NozzleConfig[];
  pumps: PumpConfig[];
  leds: LEDConfig;
  valves: { count: number; min_cycle_ms: number };
  target_platform: TargetPlatform;
}

export type TargetPlatform = 
  | 'arduino_mega'
  | 'esp32'
  | 'dmx_artnet'
  | 'json_timeline'
  | 'csv';
```

**Rules:**
- No `any` — use `unknown` + type guards if truly dynamic
- Zod schemas for all API request/response validation
- React components: functional only, hooks for state
- React Three Fiber: separate scene logic from UI components
- API endpoints: DTOs for request/response, service layer for business logic

### 4.3 File naming

- TypeScript: `kebab-case.ts`, React components: `PascalCase.tsx`
- Python: `snake_case.py`
- Directories: `kebab-case/`
- Constants: `UPPER_SNAKE_CASE`

---

## 5. Critical technical knowledge

### 5.1 Audio analysis — what each library does

| Library | Purpose | Key function | Notes |
|---------|---------|-------------|-------|
| librosa | STFT, frequency bands, onsets, RMS | `librosa.stft()`, `librosa.onset.onset_detect()` | Load at sr=22050 always |
| madmom | Beat tracking (RNN-based) | `RNNBeatProcessor` → `BeatTrackingProcessor` | Requires WAV input, not MP3 |
| MSAF | Section segmentation | `msaf.process()` | Returns boundaries + labels |
| FFmpeg | Format conversion | CLI: `ffmpeg -i input.mp3 output.wav` | Always convert to WAV first |

**IMPORTANT:** madmom requires WAV files. Always convert to WAV with FFmpeg before passing to madmom.

### 5.2 Frequency → nozzle mapping (6 bands)

```python
BAND_MAPPING = {
    "sub_bass":  {"range": (20, 60),    "nozzles": ["water_screen"]},
    "bass":      {"range": (60, 250),   "nozzles": ["center_jet", "high_jets", "ring_fountains"]},
    "low_mid":   {"range": (250, 500),  "nozzles": ["organ_fountains", "corner_jets"]},
    "mid":       {"range": (500, 2000), "nozzles": ["peacock_tail", "rising_sun", "revolving"]},
    "high_mid":  {"range": (2000, 4000),"nozzles": ["butterfly", "moving_head"]},
    "treble":    {"range": (4000, 20000),"nozzles": ["mist_lines"]},
}
```

### 5.3 Physics you MUST implement correctly

**Jet height ∝ pump speed²** (pump affinity law):
```python
# To achieve target_height_pct of max height:
vfd_speed_pct = math.sqrt(target_height_pct)
# Example: 50% height → 70.7% speed, NOT 50% speed
dmx_value = int(vfd_speed_pct * 255)
```

**Solenoid valve constraints:**
```python
MIN_ON_TIME_MS = 100    # Minimum time valve stays open
MIN_OFF_TIME_MS = 100   # Minimum time valve stays closed
MIN_CLOSE_TIME_LARGE_PIPE_MS = 300  # For pipes > 2 inches (water hammer prevention)
MAX_VALVE_FREQUENCY_HZ = 5  # Cannot switch faster than this
```

**VFD ramp rate:**
```python
MAX_VFD_CHANGE_PER_SECOND = 10  # Hz change per second
# At 40 fps: max DMX change per frame = 255 * (10/50) / 40 ≈ 1.3
# Use max_change_per_frame = 6 for safety margin
```

### 5.4 DMX channel budget (reference: Maker Associates 100x30ft fountain)

```python
DMX_CHANNEL_MAP = {
    # Universe 1 (channels 1-512)
    "rgb_leds": {"start": 1, "count": 150, "channels_each": 3, "total": 450},  # 1-450
    "solenoid_valves": {"start": 451, "count": 38, "channels_each": 1, "total": 38},  # 451-488
    "vfd_speed": {"start": 489, "count": 9, "channels_each": 1, "total": 9},  # 489-497
    "vfd_start_stop": {"start": 498, "count": 9, "channels_each": 1, "total": 9},  # 498-506
    # Overflow to Universe 2
    "laser_sets": {"universe": 2, "start": 1, "count": 2, "channels_each": 16, "total": 32},
}
```

### 5.5 Three.js particle system architecture

```typescript
// GPU-driven: physics computed in vertex shader
// CPU only sends time uniform each frame

// Vertex shader core equation:
// position = initialPosition + velocity * time + 0.5 * acceleration * time * time
// acceleration = vec3(0.0, -9.81, 0.0)  // gravity

// Key buffer attributes per particle:
// - aInitialPosition: vec3 (emitter position)
// - aVelocity: vec3 (initial velocity)
// - aLifetime: float (total lifetime in seconds)
// - aBirthTime: float (when particle was born)
// - aSize: float (particle size)
// - aColor: vec3 (initial color, modulated by nearby lights)

// Particle budget: 30,000-50,000 active particles for 60fps
// Use THREE.Points, NOT THREE.InstancedMesh (Points is faster for simple quads)
```

### 5.6 Audio sync in browser

```typescript
// AudioContext.currentTime is the SINGLE SOURCE OF TRUTH
// Never use Date.now() or performance.now() for audio sync

const audioContext = new AudioContext();
const source = audioContext.createMediaElementSource(audioElement);
const analyser = audioContext.createAnalyser();
source.connect(analyser);
analyser.connect(audioContext.destination);

function animate() {
  requestAnimationFrame(animate);
  const currentTime = audioContext.currentTime;
  const frameIndex = Math.floor(currentTime * FRAME_RATE);
  // Look up keyframes at frameIndex, interpolate, update scene
}
```

---

## 6. Code generation rules

### 6.1 Arduino Mega output structure

The generated .ino file MUST follow this pattern:

```cpp
// AUTO-GENERATED by FountainFlow — do not edit manually
// Song: [song_name]
// Duration: [duration] ms
// Generated: [timestamp]
// Fountain: [config_name]

#include <SD.h>
#include <SPI.h>

// Pin assignments (generated from fountain config)
const int VALVE_PINS[] = {22, 23, 24, ...};  // Digital pins for solenoid valves
const int VFD_PINS[] = {2, 3, 4, ...};       // PWM pins for VFD speed (via DAC/PWM)
const int LED_DATA_PIN = 6;                    // NeoPixel or DMX data pin
const int AUDIO_TRIGGER_PIN = 7;               // Pin to trigger audio playback

// Show data is stored on SD card as binary file
// Format: [timestamp_ms (uint32)] [channel_count (uint8)] [channel_values (uint8[])]
// This avoids storing massive arrays in limited SRAM

void setup() {
  // Initialize pins
  for (int i = 0; i < sizeof(VALVE_PINS)/sizeof(int); i++) {
    pinMode(VALVE_PINS[i], OUTPUT);
  }
  // Initialize SD card
  SD.begin(53);  // Mega SPI CS pin
  // Wait for audio trigger
}

void loop() {
  // Read next frame from SD card
  // Compare timestamp with millis()
  // Set output values
  // Handle valve timing constraints
}
```

**IMPORTANT:** Arduino Mega has only 8 KB SRAM. A 3-minute show at 40fps = 7,200 frames. Even at 1 byte per channel, 500 channels × 7,200 frames = 3.6 MB. This MUST go on SD card, not in program memory.

### 6.2 ESP32 output structure

Same concept as Arduino but:
- Use SPIFFS or LittleFS instead of SD card
- Can use WiFi for remote trigger
- Has 520 KB SRAM — can buffer more frames
- Use dual-core: Core 0 for timing/playback, Core 1 for WiFi/LED update

### 6.3 DMX Art-Net output

Binary file format:
```
[Header: "FFSHOW" (6 bytes)]
[Version: uint16 (2 bytes)]
[Frame rate: uint16 (2 bytes)]
[Universe count: uint8 (1 byte)]
[Frame count: uint32 (4 bytes)]
[Frame 0: [universe_0: 512 bytes] [universe_1: 512 bytes] ...]
[Frame 1: ...]
...
```

This can be played back by any Art-Net controller software or a simple Python/Node script.

### 6.4 Generic JSON timeline

```json
{
  "version": "1.0",
  "generator": "FountainFlow",
  "metadata": {
    "song_name": "Dil Se Re",
    "duration_ms": 180000,
    "frame_rate": 40,
    "generated_at": "2026-03-25T12:00:00Z"
  },
  "fountain_config": { ... },
  "tracks": [
    {
      "actuator_id": "center_jet",
      "type": "vfd",
      "keyframes": [
        {"t": 0, "v": 0},
        {"t": 2500, "v": 204, "e": "easeInOut"},
        {"t": 5000, "v": 255}
      ]
    }
  ]
}
```

---

## 7. Testing strategy

### 7.1 Test audio files

Keep 4 test files in `apps/worker/tests/fixtures/`:
1. `pop_english_30s.wav` — simple 4/4 beat, clear sections (use any royalty-free pop track)
2. `classical_60s.wav` — no drums, complex dynamics (use a Mozart/Beethoven excerpt)
3. `bollywood_30s.wav` — Indian film music with tabla, complex rhythm
4. `silence_gaps.wav` — two 15s clips separated by 2s silence (stitched song test)

If you cannot find test audio files, GENERATE them using Python:
```python
import numpy as np
import soundfile as sf

sr = 22050
# Generate a simple test tone with beats
t = np.linspace(0, 10, sr * 10)
beat_times = np.arange(0, 10, 0.5)  # 120 BPM
signal = np.zeros_like(t)
for bt in beat_times:
    signal += np.exp(-20 * (t - bt) ** 2) * np.sin(2 * np.pi * 100 * t)
signal += 0.3 * np.sin(2 * np.pi * 440 * t)  # melody
sf.write("test_tone_10s.wav", signal / np.max(np.abs(signal)), sr)
```

### 7.2 What to test

| Component | Test type | What to verify |
|-----------|----------|---------------|
| Audio pipeline | Unit | Beat count ±5%, section boundaries within 500ms, all 6 bands have data |
| Choreography engine | Unit | All tracks have keyframes, no valve cycle < 100ms, VFD values 0-255 |
| Code generators | Snapshot | Generated code compiles (Arduino: use arduino-cli verify) |
| 3D simulation | Manual | Particles visible, audio syncs, 60fps on test machine |
| API endpoints | Integration | Upload → process → download flow completes |

---

## 8. Environment variables

```bash
# See .env.example for full list
DATABASE_URL=postgresql://user:pass@localhost:5432/fountainflow
REDIS_URL=redis://localhost:6379
S3_BUCKET=fountainflow-dev
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
CLERK_SECRET_KEY=xxx
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=xxx

# Optional: AI-assisted choreography
ANTHROPIC_API_KEY=xxx  # For Claude API choreography refinement
```

---

## 9. Common mistakes to avoid

1. **Don't load full audio into browser memory.** Use Web Audio API with streaming/buffered playback.
2. **Don't store timeline frames in PostgreSQL.** Store as compressed JSON in S3, only metadata in DB.
3. **Don't create 150 THREE.PointLight objects.** Use shader uniforms for light positions/colors.
4. **Don't use `Date.now()` for audio sync.** Use `AudioContext.currentTime`.
5. **Don't assume linear pump-speed-to-height.** It's quadratic (pump affinity law: H ∝ N²).
6. **Don't let valves switch faster than 5 Hz.** Enforce min cycle time of 200ms.
7. **Don't process audio in the API server process.** Use a separate worker via message queue.
8. **Don't import madmom without converting to WAV first.** madmom crashes on MP3 input.
9. **Don't put show data in Arduino SRAM.** Use SD card for anything over 30 seconds.
10. **Don't use `THREE.Geometry`.** It was removed in Three.js r125+. Use `THREE.BufferGeometry`.

---

## 10. How to update this file

After completing a major component or encountering a significant learning, append to this file:

```markdown
---

## Lesson log

### [Date] — [Component]
**Context:** What were you building?
**Problem:** What went wrong or was surprising?
**Solution:** How did you fix it?
**Rule for future:** What should always/never be done?
```

This makes the project self-improving. Each development session benefits from all previous sessions.

---

## Lesson log

(Claude Code: append your learnings below this line as you work)

---

### 2026-03-25 — Full platform build (Session 1 + 2)

**Context:** Built the entire FountainFlow platform from scratch in two sessions — Python worker, NestJS API, and Next.js frontend with 3D simulation.

**Problem 1:** Three background build agents hit Anthropic API rate limits mid-build, leaving each app partially complete.
**Solution:** After rate-limit recovery, inventoried exactly which files each agent produced, then built all remaining files sequentially in the main context.
**Rule:** For large autonomous builds, prefer sequential construction over parallel agents unless the tasks are truly independent and small.

**Problem 2:** `ConfigWizard` was built with `onComplete: (projectId: string) => void` (creating project internally), but the pre-existing `new/page.tsx` expected `onComplete: (config: FountainConfig, name: string) => void` (caller handles project creation).
**Solution:** Re-read `new/page.tsx` before finalizing component signatures, then rewrote `ConfigWizard` to match.
**Rule:** Always read the call site before implementing a component. The page that uses a component defines the contract.

**Problem 3:** `AudioUploader` interface mismatch — built with `onUploadComplete(s3Key, filename)` but `new/page.tsx` expected `onUploadComplete(key)` with `projectId` as a separate prop.
**Solution:** Rewrote `AudioUploader` to match call site: `{ projectId: string; onUploadComplete: (s3Key: string) => void }`.
**Rule:** When multiple components interact, read ALL call sites before writing any of them.

**Key insight — GPU particle system:** The vertex shader computes `p(t) = p0 + v0*t + 0.5*g*t²` entirely on the GPU. CPU only sends `uTime` each frame (one float). This scales to 10,000+ particles at 60fps with no CPU bottleneck.

**Key insight — audio sync:** `AudioContext.currentTime` is the only reliable source of truth for sub-millisecond audio sync. `Date.now()` drifts by 10-50ms even on fast machines.

**Key insight — LED sprites vs PointLights:** At 150+ LEDs, `THREE.PointLight` per LED costs ~2ms/light for shadow map updates. Colored `MeshBasicMaterial` sprites with `AdditiveBlending` + `UnrealBloomPass` give the same visual result at near-zero GPU cost.

**If rebuilding, I would:** Write the page files first, extract component interfaces from their usage, then implement the components to match. Bottom-up interface design from call sites prevents mismatch rewrites.

---

### 2026-03-25 — Blocker fixes (Session 3)

**Context:** Found and fixed 4 integration blockers that prevented the app from running locally.

**Bug 1 — Queue architecture mismatch:**
NestJS used Bull queue but had no consumer. Python worker used Celery. They never spoke to each other.
**Fix:** Added `JobsProcessor` (`@nestjs/bull` `@Processor`) that reads Bull jobs and HTTP-POSTs to Python worker FastAPI `POST /jobs/:id/process`. The worker then enqueues a Celery task and returns 202. Added `WORKER_URL` to NestJS config.
**Rule:** When two services communicate via a queue, always verify BOTH the producer AND the consumer exist and speak the same protocol.

**Bug 2 — Worker callback URL and payload mismatch:**
Worker posted to `/jobs/{id}/progress` with no `status` field. NestJS listened at `/jobs/{id}/callback` and required `status: 'running'|'completed'|'failed'`.
**Fix:** Changed `_post_progress` to post to `/callback`, added `status` kwarg, propagated result S3 keys in the completed callback.
**Rule:** When an API route is the target of a webhook, verify the URL path AND the payload schema match from both ends before first run.

**Bug 3 — S3 env var names:**
`settings.py` field names (`aws_access_key_id`, `s3_endpoint_url`) didn't match `.env.example` (`S3_ACCESS_KEY`, `S3_ENDPOINT`). Pydantic Settings maps by field name → env var name exactly.
**Fix:** Renamed fields to `s3_access_key`, `s3_secret_key`, `s3_endpoint` to match existing env var names.
**Rule:** Both sides of any env → config mapping must be verified. Pydantic field `foo_bar` maps to env `FOO_BAR` (uppercase). Always test with a real `.env` file.

**Bug 4 — `simulation_data_key` never set:**
3D viewer loaded from `job.simulation_data_key`, but the worker never uploaded a separate simulation file and never set this field.
**Fix:** Set `simulation_data_key = timeline_key` in the worker result (they're the same JSON). Frontend falls back to `timeline_key` when `simulation_data_key` is null.
**Rule:** When a field is consumed by the frontend but produced by the backend, verify it's actually set. grep for the field name across both sides.

**Brand colors update:** Changed from cyan `#00aaff` to deep blue `#185FA5` (primary) + coral `#D85A30` (accent). Updated tailwind.config.ts color scales, globals.css CSS variables, gradient utilities, and glow keyframes.

---
