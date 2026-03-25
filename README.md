# FountainFlow

**Automated musical fountain choreography.** Upload a song and your fountain config — get downloadable control code and a 3D browser simulation.

---

## What this does

FountainFlow takes any song (MP3/WAV, any language, up to 45 minutes) and a description of your fountain hardware (nozzle types, pump count, LED count, etc.) and produces:

1. **Control code** for your hardware (Arduino, ESP32, DMX, or generic JSON)
2. **A 3D browser simulation** showing exactly how your fountain will perform to that song

The system analyzes the song's beats, frequency bands, energy, and structure — then maps those features to fountain actuators using a three-layer choreography algorithm with aesthetic rules. No musical knowledge required from the user.

---

## Architecture at a glance

```
Song (MP3) ──→ Python Worker ──→ Audio Analysis (JSON)
                                      │
Fountain Config ─────────────────────→ Choreography Engine ──→ Timeline (JSON)
                                                                    │
                                                    ┌───────────────┼───────────────┐
                                                    ▼               ▼               ▼
                                              Arduino .ino    DMX Binary     3D Sim Data
                                              (download)      (download)     (browser)
```

**Three services:**
- `apps/web` — Next.js 14 frontend with React Three Fiber for 3D simulation
- `apps/api` — NestJS backend handling auth, projects, file orchestration
- `apps/worker` — Python FastAPI worker doing audio analysis + choreography + code generation

---

## Prerequisites

- **Node.js 20+** and **pnpm 9+**
- **Python 3.11+** with pip
- **Docker** and **Docker Compose** (for PostgreSQL, Redis, MinIO)
- **FFmpeg** installed and on PATH (`brew install ffmpeg` / `apt install ffmpeg`)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/your-org/fountainflow.git
cd fountainflow

# Install Node dependencies
pnpm install

# Install Python dependencies
cd apps/worker
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### 2. Start infrastructure

```bash
# Starts PostgreSQL, Redis, MinIO (S3-compatible)
docker-compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — see next_steps.md for which values need manual setup
```

Required environment variables:
```
DATABASE_URL=postgresql://fountainflow:fountainflow@localhost:5432/fountainflow
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=fountainflow-dev
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
CLERK_SECRET_KEY=          # Get from clerk.com dashboard
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  # Get from clerk.com dashboard
```

### 4. Run database migrations

```bash
pnpm --filter api db:migrate
```

### 5. Start all services

```bash
# Terminal 1: Frontend
pnpm --filter web dev

# Terminal 2: API server
pnpm --filter api dev

# Terminal 3: Python worker
cd apps/worker
source venv/bin/activate
uvicorn main:app --reload --port 8001
```

Or use the combined command:
```bash
pnpm dev  # Runs all three via turbo
```

### 6. Open the app

Navigate to `http://localhost:3000`

---

## Project structure

```
fountainflow/
├── apps/
│   ├── web/          # Next.js 14 frontend (React Three Fiber for 3D)
│   ├── api/          # NestJS API server (auth, projects, files)
│   └── worker/       # Python audio analysis + choreography engine
├── packages/
│   └── shared/       # Shared TypeScript types
├── docs/             # Additional documentation
├── CLAUDE.md         # Autonomous development guide
├── product_spec.md   # Full product specification
├── design_decisions.md
├── limitations.md
└── next_steps.md
```

---

## How the pipeline works

### Step 1: Audio analysis (Python)

The worker analyzes the uploaded song using:

| Library | Purpose |
|---------|---------|
| **FFmpeg** | Convert any audio format to WAV |
| **librosa** | STFT frequency decomposition, onset detection, RMS energy |
| **madmom** | RNN-based beat tracking (state-of-the-art accuracy) |
| **MSAF** | Automatic section segmentation (verse, chorus, bridge) |

Output: a structured JSON with beats, 6-band frequency energies, section boundaries, onsets, and energy envelope.

### Step 2: Choreography mapping (Python)

Three hierarchical layers transform audio features into actuator commands:

- **Layer 1 — Section themes:** Each detected section (intro, verse, chorus, bridge, outro) gets a choreographic theme determining which fountain elements are active and at what intensity.

- **Layer 2 — Beat scheduling:** On each detected beat, trigger valve-based effects (open/close solenoids) according to the current section's pattern template and beat strength.

- **Layer 3 — Continuous energy mapping:** Map frequency band energies to VFD pump speeds at 40 fps, with exponential smoothing and square-root correction for the jet height physics (H ∝ N²).

RGB LED colors are mapped using musical mood (arousal + valence → color wheel position).

### Step 3: Code generation (Python)

The unified timeline JSON is transpiled into the target platform format:

| Target | Output | How it works |
|--------|--------|-------------|
| Arduino Mega | `.ino` + `.bin` (SD card data) | millis()-based timing loop reading frames from SD |
| ESP32 | `.ino` + SPIFFS data | Same but uses SPIFFS filesystem and optional WiFi trigger |
| DMX Art-Net | `.ffshow` binary | Frame-by-frame DMX universe data, playable by any Art-Net software |
| JSON Timeline | `.json` | Human-readable keyframed timeline for custom controllers |
| CSV | `.csv` | Timestamp + channel + value rows for PLC/spreadsheet import |

### Step 4: 3D simulation (Browser)

React Three Fiber renders the fountain with GPU-driven particle systems:
- 30,000-50,000 particles computed in vertex shaders (no CPU bottleneck)
- Audio sync via `AudioContext.currentTime` (hardware-precision)
- RGB lighting via shader uniforms + UnrealBloomPass post-processing
- Supports orbit camera, preset angles, and auto-rotate

---

## Key commands

```bash
# Development
pnpm dev                  # Start all services
pnpm build                # Build everything
pnpm lint                 # Lint all packages
pnpm typecheck            # Type check all TypeScript

# Testing
pnpm test                 # Run all tests
pnpm --filter worker test # Run Python worker tests only
pnpm --filter web test    # Run frontend tests only

# Database
pnpm --filter api db:migrate  # Run migrations
pnpm --filter api db:seed     # Seed with test data

# Docker
docker-compose up -d      # Start infrastructure
docker-compose down        # Stop infrastructure
docker-compose down -v     # Stop and delete volumes (fresh start)

# Python worker standalone
cd apps/worker
python -m pytest tests/    # Run worker tests
python -c "from audio_analysis.pipeline import analyze; analyze('test.wav')"
```

---

## Supported fountain hardware

The system generates code for any combination of:

- **Nozzle types:** Center Jet, High Jets, Ring Fountains (any diameter), Peacock Tail, Rising Sun, Revolving Fountain, Butterfly/Moving Head, Organ Fountains, Corner Jets, Mist Lines, Water Screen
- **Pumps:** 1-20 submersible pumps, 1-50 HP, controlled via VFD (Modbus) or direct on/off
- **Valves:** 1-100 solenoid valves with configurable timing constraints
- **Lighting:** 1-500 RGB LEDs (DMX-addressed, 3 channels each)
- **Extras:** RGB lasers (DMX), HD projector trigger

---

## Processing time estimates

| Song length | Processing time | Memory needed |
|------------|----------------|---------------|
| 3 minutes | ~60 seconds | ~128 MB |
| 10 minutes | ~3.5 minutes | ~256 MB |
| 30 minutes | ~10 minutes | ~1 GB |
| 45 minutes | ~15 minutes | ~1.5 GB |

For stitched multi-song files, the system automatically detects song boundaries (silence gaps > 1 second) and applies intermission choreography between songs.

---

## Contributing

See `CLAUDE.md` for coding standards and architecture guidelines. The project uses:
- TypeScript strict mode for all Node.js code
- Python type hints on all functions
- Zod for API validation
- pytest for Python, vitest for TypeScript

---

## License

Proprietary — not open source. See LICENSE file for terms.
