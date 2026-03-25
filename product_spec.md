# Product Specification: FountainFlow — Automated Musical Fountain Choreography SaaS

## Version: 1.0-draft
## Last Updated: 2026-03-25

---

## 1. Product vision

FountainFlow is a web platform where fountain operators upload a song (any language, any length up to 45 minutes) and their fountain hardware configuration, and receive:

1. **Downloadable control code** (Arduino .ino, DMX sequence, JSON timeline, or raw CSV) that runs the fountain synchronized to that song
2. **A browser-based 3D simulation** showing exactly how the fountain will look during playback

The user does NOT need to understand audio engineering, DMX protocols, or choreography. They upload, wait, download, and deploy.

---

## 2. Target users

| User type | What they need | Willingness to pay |
|-----------|---------------|-------------------|
| Indian fountain companies (Maker Associates, Symphony, etc.) | Reduce 10-hour choreography to 10 minutes | $50-200/show |
| Small-town municipal fountains | New shows without hiring a choreographer | $30-100/show |
| Event companies | One-off shows for weddings, festivals | $20-50/show |
| DIY hobbyists / Arduino makers | Fun project, small fountains | Free tier / $5-10 |
| Large integrators (Crystal, Syncronorm competitors) | Evaluate, probably won't use | N/A |

---

## 3. Core user flow

```
Step 1: User creates a project
  └─ Names it, selects fountain type (custom or preset templates)

Step 2: User configures fountain hardware
  ├─ Option A: Upload layout image (PDF/PNG/DXF) → click to place nozzles
  ├─ Option B: Choose from preset templates (100x30ft, 50x20ft, etc.)
  └─ Option C: Fill form — number of jets, pumps, LEDs, valves, etc.
  
  Required fields:
    - Nozzle types and counts (Center Jet, High Jets, Ring, Peacock, etc.)
    - Number of pumps and HP ratings
    - Number of solenoid valves
    - Number of RGB LEDs
    - Target platform (Arduino Mega, ESP32, DMX controller, PLC, generic JSON)
  
  Optional fields:
    - VFD count and Modbus addresses
    - Laser count
    - Physical dimensions (length x width in feet)
    - Nozzle positions (x, y coordinates)
    - Max jet heights per nozzle type
    - Pipe diameters (affects valve timing constraints)

Step 3: User uploads song(s)
  ├─ Single song (MP3/WAV/FLAC/AAC, up to 45 minutes)
  ├─ Multiple songs for a setlist (processed sequentially)
  └─ Pre-stitched long file (40+ minutes, treated as one continuous piece)

Step 4: System processes (user sees progress bar, ~2-3 min per song)
  ├─ Audio analysis pipeline (beats, bands, sections, energy)
  ├─ Choreography mapping (rules engine + optional AI refinement)
  ├─ Code generation (target platform specific)
  └─ 3D simulation data generation

Step 5: User reviews results
  ├─ 3D simulation plays in browser with song audio
  ├─ Timeline view shows what each nozzle/pump/LED does over time
  ├─ User can tweak parameters and regenerate
  └─ Download code package (.zip with code + instructions + wiring diagram)

Step 6: User deploys
  └─ Uploads code to their hardware, connects audio, fountain runs
```

---

## 4. System architecture

### 4.1 High-level components

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14+)                │
│  React Three Fiber (3D sim) │ Upload UI │ Timeline view  │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                  API SERVER (NestJS / Node)               │
│  Auth │ Project CRUD │ File orchestration │ WS progress   │
└───┬──────────┬───────────────┬───────────────────────────┘
    │          │               │
    ▼          ▼               ▼
┌───────┐ ┌───────┐    ┌──────────────────────────────────┐
│ PostgreSQL │ S3   │    │  MESSAGE QUEUE (SQS / BullMQ)     │
│ (projects, │(files)│    └──────────────┬───────────────────┘
│  configs)  │      │                   │
└───────┘ └───────┘                   ▼
                        ┌──────────────────────────────────┐
                        │  PYTHON WORKER (FastAPI + Celery)  │
                        │                                    │
                        │  ┌──────────┐  ┌───────────────┐  │
                        │  │ Audio    │  │ Choreography  │  │
                        │  │ Analysis │→ │ Engine        │  │
                        │  │ Pipeline │  │ (3 layers)    │  │
                        │  └──────────┘  └───────┬───────┘  │
                        │                        │          │
                        │  ┌──────────┐  ┌───────▼───────┐  │
                        │  │ Code     │  │ Simulation    │  │
                        │  │ Generator│  │ Data Builder  │  │
                        │  └──────────┘  └───────────────┘  │
                        └──────────────────────────────────┘
```

### 4.2 Technology stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js 14+ (App Router) + TypeScript | SSR, file-based routing, Vercel deploy |
| 3D Engine | React Three Fiber + drei | Declarative Three.js, React ecosystem |
| API | NestJS (TypeScript) | Structured, WebSocket built-in, guards/pipes |
| Audio Worker | Python 3.11 + FastAPI + Celery | librosa/madmom only run in Python |
| Queue | BullMQ (Redis-backed) or SQS | Job dispatch, progress tracking |
| Database | PostgreSQL 16 + JSONB | Relational + flexible config columns |
| Storage | S3 (or MinIO locally) | Audio files, generated packages |
| Auth | Clerk | Free tier to 50k MAU, Stripe billing built-in |
| Hosting | Vercel (frontend) + Railway/Fly.io (API) + Cloud Run (workers) | Cost-effective at low scale |

### 4.3 Long song handling (40-minute stitched files)

**Yes, this works.** Constraints and mitigations:

| Concern | 3-min song | 40-min song | Mitigation |
|---------|-----------|-------------|------------|
| Processing time | ~60 sec | ~12-15 min | Show progress bar with stage updates |
| Memory (librosa load) | ~30 MB | ~400 MB | Use 4 GB worker containers |
| Beat tracking (madmom) | ~20 sec | ~4 min | Acceptable, no change needed |
| Section detection (MSAF) | ~10 sec | ~3 min | May produce 30-50 sections — fine |
| Output file size | ~500 KB | ~8-12 MB | Compress JSON, chunk timeline data |
| 3D sim data | 7,200 frames | 96,000 frames | Stream chunks, don't load all in RAM |
| Song boundary detection | N/A | Needed! | Detect silence gaps > 1 sec as boundaries |

**Critical for stitched songs:** The system MUST detect song boundaries within a stitched file. A 2-second silence gap between songs should trigger a choreography reset — new section theme assignment, brief pause in effects, then ramp up for the new song. MSAF will naturally detect these as section boundaries, but the choreography engine needs special handling: treat a "silence section" as an INTERMISSION with only the center jet at 10% and cool blue lighting.

**Worker configuration for long songs:**
```yaml
worker:
  memory: 4096  # MB — needed for 40-min files in memory
  timeout: 1200  # 20 minutes max processing time
  cpu: 2         # vCPUs — madmom benefits from multicore
```

---

## 5. Development phases

### Phase 0: Project scaffolding (3-4 days)
- [ ] Monorepo setup (Turborepo: apps/web, apps/api, apps/worker, packages/shared)
- [ ] Docker Compose for local dev (PostgreSQL, Redis, MinIO)
- [ ] CI pipeline (GitHub Actions: lint, type-check, test)
- [ ] Environment variable management (.env.example, validation)
- [ ] Shared TypeScript types package (FountainConfig, AudioAnalysis, Timeline, etc.)

### Phase 1: Audio analysis pipeline (2-3 weeks)
- [ ] Python FastAPI worker with health check endpoint
- [ ] FFmpeg integration for format conversion (MP3/FLAC/AAC → WAV)
- [ ] librosa: load audio, compute STFT, extract 6-band frequency energies
- [ ] madmom: RNN beat tracking with confidence scores
- [ ] MSAF: section segmentation with boundary timestamps + labels
- [ ] Onset detection with onset_strength + peak picking
- [ ] RMS energy envelope computation
- [ ] Song boundary detection for stitched files (silence > 1s)
- [ ] Normalize all outputs to structured JSON schema (AudioAnalysisResult)
- [ ] Unit tests with 3 test songs (pop, classical, Indian film)
- [ ] Benchmark: process 3-min song in < 90 seconds on 2-vCPU

**Output schema:**
```typescript
interface AudioAnalysisResult {
  duration_ms: number;
  sample_rate: number;
  bpm: number;
  beats: { time_ms: number; strength: number }[];
  onsets: { time_ms: number; strength: number }[];
  sections: { start_ms: number; end_ms: number; label: string }[];
  song_boundaries: { time_ms: number }[];  // for stitched files
  energy: {
    frame_rate: number;  // frames per second (typically 43 for hop=512, sr=22050)
    rms: number[];
    bands: {
      sub_bass: number[];   // 20-60 Hz
      bass: number[];       // 60-250 Hz
      low_mid: number[];    // 250-500 Hz
      mid: number[];        // 500-2000 Hz
      high_mid: number[];   // 2000-4000 Hz
      treble: number[];     // 4000-20000 Hz
    };
  };
}
```

### Phase 2: Choreography engine (4-6 weeks)
- [ ] Fountain configuration schema + validation
- [ ] Nozzle type registry (13 types with physics params: max height, spread angle, etc.)
- [ ] Layer 1: Section → choreographic theme assignment (rule-based)
- [ ] Layer 2: Beat → valve scheduling with timing constraints
- [ ] Layer 3: Energy → VFD speed mapping with square-root correction
- [ ] RGB LED color engine (mood → hue, energy → saturation, beat → strobe)
- [ ] Aesthetic coherence rules (symmetry, min hold time, crescendo detection, etc.)
- [ ] Safety constraint enforcement (min valve cycle, VFD ramp rate, pump stagger)
- [ ] Timeline builder: compile all layers into unified JSON timeline
- [ ] AI refinement endpoint (optional): send analysis + config to Claude API for theme suggestions
- [ ] Intermission handling for song boundaries in stitched files

**Timeline output schema:**
```typescript
interface ShowTimeline {
  metadata: {
    duration_ms: number;
    frame_rate: number;  // 40 fps for DMX compatibility
    total_frames: number;
    fountain_config_hash: string;
    audio_file_hash: string;
  };
  tracks: Track[];
}

interface Track {
  actuator_id: string;      // "center_jet", "high_jet_01", "led_group_a", etc.
  actuator_type: "vfd" | "valve" | "rgb_led" | "laser";
  dmx_universe: number;
  dmx_channel: number;
  keyframes: Keyframe[];
}

interface Keyframe {
  time_ms: number;
  value: number;            // 0-255 for DMX
  value_r?: number;         // 0-255 for RGB
  value_g?: number;
  value_b?: number;
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "step";
}
```

### Phase 3: Code generation + 3D simulation (3-4 weeks, parallel tracks)

#### Track A: Code generators
- [ ] Arduino Mega generator (.ino file with millis()-based timing, SD card show data)
- [ ] ESP32 generator (same but with WiFi trigger + SPIFFS storage)
- [ ] DMX sequence generator (Art-Net/sACN binary stream)
- [ ] Generic JSON timeline (for custom controllers)
- [ ] CSV export (timestamp, channel, value — for PLC import)
- [ ] Modbus command sequence (for VFD speed control)
- [ ] Wiring diagram generator (SVG showing pin assignments)
- [ ] ZIP packager (code + README + wiring diagram + audio file reference)

#### Track B: 3D browser simulation
- [ ] React Three Fiber scene setup (camera, lighting, ground plane)
- [ ] Fountain layout renderer (nozzle positions from config → 3D markers)
- [ ] GPU particle system (THREE.Points + custom ShaderMaterial)
- [ ] Particle emitter types: vertical jet, fan spray, ring, rotating, mist
- [ ] Audio playback sync via Web Audio API AudioContext.currentTime
- [ ] Timeline playback engine (reads keyframes, interpolates, updates emitters)
- [ ] RGB LED visualization (colored point lights via shader uniforms + bloom)
- [ ] Camera controls (orbit, preset angles, auto-rotate)
- [ ] Performance: maintain 60fps with 30-50k particles on mid-range GPU

### Phase 4: SaaS web application (2-3 weeks)
- [ ] Landing page with demo video
- [ ] Auth flow (Clerk: sign up, sign in, org management)
- [ ] Project CRUD (create, list, edit, delete, duplicate)
- [ ] Fountain config wizard (step-by-step form or template selection)
- [ ] File upload (presigned S3 URLs for direct upload)
- [ ] Job queue integration (submit → track progress → notify completion)
- [ ] Results page (3D sim + download buttons + timeline scrubber)
- [ ] Billing integration (Clerk Billing or Stripe: per-show or subscription)
- [ ] Admin dashboard (job queue monitoring, error logs)

### Phase 5: Polish + launch (2 weeks)
- [ ] Error handling and retry logic for failed jobs
- [ ] Email notifications (job complete, job failed)
- [ ] SEO optimization (landing page, blog posts)
- [ ] Documentation site (how it works, supported hardware, API docs)
- [ ] 3 demo shows with different music genres (precomputed, embedded on landing page)
- [ ] Rate limiting and abuse prevention
- [ ] GDPR compliance (audio file retention policy, data deletion)

---

## 6. Pricing model (draft)

| Tier | Price | Includes |
|------|-------|---------|
| Free | $0 | 3 shows/month, max 5-min songs, watermarked sim, Arduino output only |
| Pro | $29/mo | 20 shows/month, max 15-min songs, all output formats, no watermark |
| Business | $99/mo | Unlimited shows, max 45-min songs, priority processing, API access |
| Enterprise | Custom | Custom fountain templates, dedicated support, SLA |

---

## 7. Key metrics to track

- Shows generated per day/week
- Processing success rate (target: > 95%)
- Average processing time per minute of audio
- 3D simulation load time and frame rate
- User retention (% returning within 30 days)
- Conversion rate (free → paid)
- Most-used output format (Arduino vs DMX vs JSON)

---

## 8. Non-goals (explicitly out of scope for v1)

- Real-time audio analysis (all processing is pre-computed)
- Manual timeline editor (Depence-style) — save for v2
- Firmware flashing from browser (user downloads and uploads manually)
- Water physics simulation (particles approximate, not simulate fluid dynamics)
- Multi-fountain synchronization (one fountain per show)
- Video projection mapping on water screens
- Laser show choreography (only on/off and basic color)
- Mobile app (web-only, responsive design)

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Choreography looks "random" / not artistic | High | Critical | Heavy investment in aesthetic rules, section-aware themes, human review of early outputs |
| madmom/MSAF produce poor results on Indian/non-Western music | Medium | High | Test with diverse corpus early, fall back to librosa for edge cases |
| 3D sim performance issues on low-end devices | Medium | Medium | LOD system, particle budget scaling, fallback 2D visualizer |
| Arduino memory limits for long shows | Medium | High | Stream from SD card, chunk timeline data |
| User expects instant results but processing takes 10+ min | Medium | Medium | Clear progress indicators, email notification |
| Copyright concerns with uploaded music | Low | Medium | We process audio features only, never store/redistribute the music itself |
