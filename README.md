# FountainFlow

**Automated musical fountain choreography.** Upload a song and your fountain config — get downloadable control code and a 3D browser simulation.

---

## One-command startup

```bash
npm run fountainflow
```

That's it. The script starts Docker infrastructure, runs DB migrations, launches the API, Python worker, Celery, and the Next.js frontend — then opens everything at **http://localhost:3002**.

> First time? Complete the [one-time setup](#one-time-setup) below first.

---

## What this does

FountainFlow takes any song (MP3/WAV, any language, up to 45 minutes) and a description of your fountain hardware (nozzle types, pump count, LED count, etc.) and produces:

1. **Control code** for your hardware (Arduino, ESP32, DMX, or generic JSON)
2. **A 3D browser simulation** showing exactly how your fountain will perform to that song

The system analyzes the song's beats, frequency bands, energy, and structure — then maps those features to fountain actuators using a three-layer choreography algorithm with aesthetic rules. No musical knowledge required from the user.

---

## Build status

| Phase | What | Status |
|-------|------|--------|
| Phase 0 | Monorepo scaffolding (Turborepo, shared types, Docker Compose) | ✅ Done |
| Phase 1 | Python worker — audio analysis pipeline (FFmpeg, librosa, madmom, MSAF) | ✅ Done |
| Phase 2 | Python worker — choreography engine + code generators (Arduino, ESP32, DMX, JSON, CSV) | ✅ Done |
| Phase 3 | NestJS API (auth, projects, jobs queue, WebSocket, storage, health) | ✅ Done |
| Phase 4 | Next.js frontend (3D simulation, upload wizard, dashboard, real-time progress) | ✅ Done |
| Phase 5 | Production deployment | 🔜 Next |

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

**Four services:**
- `apps/web` — Next.js 14 frontend with React Three Fiber 3D simulation (port 3002)
- `apps/api` — NestJS API handling auth, projects, job queue, WebSocket (port 3001)
- `apps/worker` — Python FastAPI + Celery doing audio analysis + choreography (port 8001)
- Docker — PostgreSQL (5432), Redis (6379), MinIO S3 (9000/9001)

---

## One-time setup

### Prerequisites

- **Node.js 20+** and **pnpm 9+**
- **Python 3.11** (exact — madmom requires 3.11)
- **Docker Desktop** running
- **FFmpeg** on PATH (`brew install ffmpeg` / `apt install ffmpeg`)
- **tesseract** on PATH (`brew install tesseract`) — for PDF blueprint import
- **Ollama** with `qwen2.5:14b` — for AI-powered blueprint import (optional but recommended)

### 1. Clone and install Node dependencies

```bash
git clone https://github.com/gadarsh043/fountainflow.git
cd fountainflow
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your Clerk keys (everything else has working defaults for local dev):

```
CLERK_SECRET_KEY=sk_test_...              # clerk.com → your app → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 3. Install Python dependencies

> madmom requires Cython + numpy **before** it can build. Install in this exact order:

```bash
cd apps/worker
python3.11 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install Cython "numpy==1.26.4"
pip install madmom==0.16.1 --no-build-isolation
pip install -r requirements.txt
cd ../..
```

### 4. Run it

```bash
npm run fountainflow
```

---

## Project structure

```
fountainflow/
├── start.sh              # ← npm run fountainflow entrypoint
├── apps/
│   ├── web/              # Next.js 14 — landing, dashboard, wizard, 3D sim
│   ├── api/              # NestJS — auth, REST, Bull queue, WebSocket
│   └── worker/           # Python FastAPI + Celery — audio + choreography
├── packages/
│   └── shared/           # Shared TypeScript types
├── logs/                 # Runtime logs (api.log, worker.log, celery.log)
├── docker-compose.yml    # PostgreSQL + Redis + MinIO
├── CLAUDE.md             # Autonomous development guide
├── product_spec.md       # Full product specification
├── design_decisions.md   # Why we chose what we chose
├── limitations.md        # Known limitations
└── next_steps.md         # What's left + deployment checklist
```

---

## How the pipeline works

### Step 1: Audio analysis (Python) ✅

The worker analyzes the uploaded song using:

| Library | Purpose |
|---------|---------|
| **FFmpeg** | Convert any audio format to WAV |
| **librosa** | STFT frequency decomposition, onset detection, RMS energy |
| **madmom** | RNN-based beat tracking (state-of-the-art accuracy) |
| **MSAF** | Automatic section segmentation (verse, chorus, bridge) |

Output: a structured JSON with beats, 6-band frequency energies, section boundaries, onsets, and energy envelope.

### Step 2: Choreography mapping (Python) ✅

Three hierarchical layers transform audio features into actuator commands:

- **Layer 1 — Section themes:** Each detected section (intro, verse, chorus, bridge, outro) gets a choreographic theme determining which fountain elements are active and at what intensity.
- **Layer 2 — Beat scheduling:** On each detected beat, trigger valve-based effects according to the current section's pattern template and beat strength.
- **Layer 3 — Continuous energy mapping:** Map frequency band energies to VFD pump speeds at 40 fps, with exponential smoothing and square-root correction for the jet height physics (H ∝ N²).

RGB LED colors are mapped using musical mood (arousal + valence → color wheel position).

### Step 3: Code generation (Python) ✅

| Target | Output | How it works |
|--------|--------|-------------|
| Arduino Mega | `.ino` + `.bin` (SD card data) | millis()-based timing loop reading frames from SD |
| ESP32 | `.ino` + SPIFFS data | Same but uses SPIFFS filesystem and optional WiFi trigger |
| DMX Art-Net | `.ffshow` binary | Frame-by-frame DMX universe data, playable by any Art-Net software |
| JSON Timeline | `.json` | Human-readable keyframed timeline for custom controllers |
| CSV | `.csv` | Timestamp + channel + value rows for PLC/spreadsheet import |

### Step 4: 3D simulation (Browser) ✅

React Three Fiber renders the fountain with GPU-driven particle systems:
- 30,000–50,000 particles computed in vertex shaders (no CPU bottleneck)
- Audio sync via `AudioContext.currentTime` (hardware-precision, never `Date.now()`)
- RGB lighting via shader uniforms + UnrealBloomPass post-processing
- Orbit camera, preset angles, auto-rotate

---

## Key commands

```bash
# ── One command to rule them all ───────────────────────────────────────────
npm run fountainflow          # Start everything (recommended)

# ── Individual services ────────────────────────────────────────────────────
pnpm --filter web dev         # Frontend only (http://localhost:3002)
pnpm --filter api dev         # API only      (http://localhost:3001)

# ── Build & quality ────────────────────────────────────────────────────────
pnpm build                    # Build all packages
pnpm lint                     # Lint everything
pnpm typecheck                # TypeScript check

# ── Database ───────────────────────────────────────────────────────────────
cd apps/api
npx prisma migrate dev        # Create + apply new migration
npx prisma migrate deploy     # Apply existing migrations (CI/prod)
npx prisma studio             # GUI database browser

# ── Docker infrastructure ──────────────────────────────────────────────────
docker-compose up -d          # Start PostgreSQL, Redis, MinIO
docker-compose down           # Stop
docker-compose down -v        # Stop + wipe volumes (fresh start)

# ── Python worker ──────────────────────────────────────────────────────────
cd apps/worker && source venv/bin/activate
uvicorn main:app --reload --port 8001    # FastAPI dev server
celery -A worker worker --loglevel=info  # Celery background worker
python -m pytest tests/                  # Run worker tests

# ── AI blueprint import (optional) ─────────────────────────────────────────
ollama serve                       # Start Ollama on port 11434
ollama pull qwen2.5:14b            # Download text model (~9 GB, one-time)
```

---

## Supported fountain hardware

- **Nozzle types:** Center Jet, High Jets, Ring Fountains (any diameter), Peacock Tail, Rising Sun, Revolving Fountain, Butterfly/Moving Head, Organ Fountains, Corner Jets, Mist Lines, Water Screen
- **Pumps:** 1–20 submersible pumps, 1–50 HP, controlled via VFD (Modbus) or direct on/off
- **Valves:** 1–100 solenoid valves with configurable timing constraints
- **Lighting:** 1–500 RGB LEDs (DMX-addressed, 3 channels each)
- **Extras:** RGB lasers (DMX), HD projector trigger

---

## Processing time estimates

| Song length | Processing time | Memory needed |
|------------|----------------|---------------|
| 3 minutes  | ~60 seconds    | ~128 MB       |
| 10 minutes | ~3.5 minutes   | ~256 MB       |
| 30 minutes | ~10 minutes    | ~1 GB         |
| 45 minutes | ~15 minutes    | ~1.5 GB       |

---

## License

Proprietary — not open source. See LICENSE file for terms.
