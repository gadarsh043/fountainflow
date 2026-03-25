# Building a SaaS platform for automated musical fountain choreography

**Automated musical fountain choreography is technically feasible today using a combination of Python audio analysis, DMX512 control code generation, and Three.js browser-based simulation.** The core challenge is not any single technology gap but rather the integration of four distinct engineering domains — audio signal processing, industrial control protocols, real-time 3D graphics, and SaaS infrastructure — into a coherent product. Professional fountain companies like WET Design and Crystal Fountains still choreograph shows manually at a cost of 2–10 hours per 3-minute song, creating a genuine market opportunity for automation. This report provides a complete technical blueprint across all five system layers, with specific libraries, protocols, algorithms, and architecture recommendations suitable for immediate development.

---

## 1. The audio analysis pipeline extracts music structure without understanding language

The entire audio analysis pipeline operates on acoustic signal properties — waveform energy, spectral density, rhythmic periodicity — making it **completely language-agnostic**. A Bollywood track in Hindi, an Odia devotional song, and an English pop anthem all yield the same feature types: beat positions, frequency band energies, onset timestamps, and section boundaries. No lyrics processing is needed whatsoever.

### Recommended library stack

**Primary server-side engine: Python with librosa + madmom + MSAF.** Librosa provides the broadest feature set for a fountain SaaS: STFT-based frequency decomposition, onset detection via spectral flux, harmonic-percussive source separation, and basic beat tracking. Madmom (from JKU Austria) adds state-of-the-art beat tracking using bidirectional LSTMs with Dynamic Bayesian Networks — it consistently ranks #1 in MIREX beat detection competitions and handles complex rhythms (classical Indian music, polyrhythmic African music) far better than librosa's simpler dynamic programming approach. MSAF (Music Structure Analysis Framework) handles automatic segmentation into verse, chorus, bridge, and intro/outro sections using self-similarity matrices and checkerboard kernel novelty detection.

The processing pipeline for a single uploaded song runs server-side in **under 60 seconds** on a 2-vCPU container:

```python
# Step 1: Load and decode (FFmpeg handles MP3/WAV/FLAC/AAC)
y, sr = librosa.load('song.mp3', sr=22050)

# Step 2: Beat tracking (madmom RNN for accuracy)
from madmom.features.beats import RNNBeatProcessor, BeatTrackingProcessor
beats = BeatTrackingProcessor(fps=100)(RNNBeatProcessor()('song.wav'))

# Step 3: Frequency band energy extraction via STFT
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
bass_energy = np.mean(S[(freqs >= 20) & (freqs < 250), :] ** 2, axis=0)
mid_energy = np.mean(S[(freqs >= 250) & (freqs < 4000), :] ** 2, axis=0)
treble_energy = np.mean(S[(freqs >= 4000) & (freqs < 20000), :] ** 2, axis=0)

# Step 4: Onset detection
onset_env = librosa.onset.onset_strength(y=y, sr=sr)
onset_times = librosa.frames_to_time(librosa.onset.onset_detect(y=y, sr=sr))

# Step 5: Section segmentation
import msaf
boundaries, labels = msaf.process("song.mp3")

# Step 6: Overall energy envelope
rms = librosa.feature.rms(y=y)[0]
```

For the browser-side preview, **Essentia.js** (WebAssembly port of the C++ Essentia library) provides near-native performance for real-time audio visualization, while the **Web Audio API's AnalyserNode** gives live FFT data for reactive 3D effects during playback.

### Six-band frequency decomposition drives fountain mapping

Rather than a simple bass/mid/treble split, a **six-band decomposition** provides the granularity needed for diverse fountain elements:

| Band | Frequency range | Fountain element mapping |
|------|----------------|--------------------------|
| Sub-bass | 20–60 Hz | Water screen rumble, ground-shaking bass effects |
| Bass | 60–250 Hz | Center Jet, High Jets (24), Ring Fountains |
| Low-mid | 250–500 Hz | Organ Fountains (4), Corner Jets (2) |
| Mid | 500–2000 Hz | Peacock Tail (2), Rising Sun (2), Revolving Fountain |
| High-mid | 2000–4000 Hz | Butterfly/Moving Head (2), individual jet patterns |
| Treble | 4000–20000 Hz | Mist Lines (4), fine spray effects, sparkle lighting |

**Pre-computed analysis is strongly recommended over real-time.** Pre-computation enables non-causal algorithms (which look both forward and backward in the audio) for dramatically better accuracy, deterministic results, and access to the full algorithm catalog including RNN-based beat tracking and structural segmentation — none of which work in causal/real-time mode.

---

## 2. DMX512 is the universal language of fountain show control

A critical finding from researching professional fountain companies is that **DMX512 serves as the universal show control protocol** — not just for lighting, but for the entire fountain system including pumps, valves, and effects. Crystal Fountains' WATERlab CONTROL system, Syncronorm's Depence software (the industry-leading fountain programming tool), and companies like Symphony Fountains all use DMX as the primary choreography protocol, with DMX-to-Modbus bridges translating pump speed commands for VFDs.

### How DMX512 works for this fountain

DMX512 transmits **512 channels per universe**, each carrying an 8-bit value (0–255), refreshed at approximately **40 frames per second** over RS-485 differential signaling. For the target 100×30 ft fountain, the channel budget breaks down to approximately **538 channels across 2 universes**:

| Component | Count | Channels each | Total |
|-----------|-------|--------------|-------|
| RGB LED lights | 150 | 3 (R, G, B) | 450 |
| Solenoid valves | 38 | 1 (on/off via relay decoder) | 38 |
| VFD pump speed | 9 | 1 (0–255 → frequency via bridge) | 9 |
| VFD start/stop | 9 | 1 (on/off) | 9 |
| RGB laser sets | 2 | ~16 | 32 |

The control system architecture in production installations follows a clear hierarchy: **Show Software → Art-Net/sACN over Ethernet → DMX Nodes → Physical DMX → Decoders → Actuators**. Art-Net (UDP port 6454, up to 32,768 universes) and sACN/E1.31 (UDP port 5568, multicast with priority system) transport DMX data over standard Ethernet networks to DMX node hardware that converts back to physical RS-485 DMX for each universe.

### Modbus for VFD pump speed control

The 9 VFDs controlling pump speed communicate via **Modbus RTU over RS-485** (or Modbus TCP over Ethernet). Each VFD has a register for speed reference — on a typical Danfoss VLT drive, writing to the speed reference register (address 0x0010) with a value from 0x0000 (0%) to 0x4000 (100% of maximum frequency) sets the motor speed. The critical physics relationship for jet height mapping: **jet height is proportional to the square of pump speed** (from the pump affinity laws: H ∝ N²). Therefore, to achieve 50% of maximum jet height, the VFD must run at **√0.5 ≈ 70.7%** of full speed, not 50%. The SaaS must embed this square-root relationship in its height-to-frequency mapping, ideally with per-nozzle calibration tables generated during commissioning.

### Solenoid valve timing constraints

Solenoid valves have physical limits the code generator must respect: **minimum on-time of 100ms** (for full opening), **minimum off-time of 100ms**, and critically, **minimum close time of 200–500ms for pipes larger than 2"** to prevent water hammer. The SaaS choreography engine must enforce these as hard constraints — a valve cannot switch faster than 5 Hz regardless of what the audio analysis suggests.

### What the SaaS should generate

Based on industry practice, the SaaS should output a **multi-layer show package**:

1. **JSON timeline** (human-readable): timestamped cues with channel values, fade times, and labels — editable, versionable, web-friendly
2. **Art-Net/sACN binary stream**: compact frame-by-frame DMX data (40 fps × duration × 512 bytes/universe × 2 universes) for direct playback by hardware controllers
3. **Modbus command sequence**: timed register writes for VFD speed changes (downsampled to ~10 fps, respecting ramp rate constraints)
4. **Safety configuration**: per-actuator constraints (minimum valve cycle times, VFD ramp rates, pump stagger delays)

The JSON timeline format serves as the primary interchange format:
```json
{
  "show": {
    "duration_ms": 180000,
    "frame_rate": 40,
    "universes": 2,
    "tracks": [
      {
        "actuator_id": "center_jet",
        "type": "vfd",
        "keyframes": [
          {"time_ms": 0, "value": 0, "easing": "linear"},
          {"time_ms": 2500, "value": 204, "easing": "easeInOut"},
          {"time_ms": 5000, "value": 255}
        ]
      }
    ]
  }
}
```

---

## 3. The mapping algorithm transforms audio features into choreographic commands

This is the intellectual core of the platform. The research literature reveals two main approaches and a clear recommendation.

### Rule-based mapping is the practical starting point

The **IMFAS system** (Vassilis Yfantis et al., ResearchGate) — the most complete academic work on automated fountain choreography — uses spectral flux onset detection to identify audio events, then assigns control units with conditional probabilities. The **Self-Choreographed Musical Fountain System** (SSRG-IJECE 2016) takes a modular approach: segment audio by chord changes, compute MIR parameters (danceability, energy) per segment, then match segments to 35 predefined water jet sequence patterns. Both systems confirm that **rule-based approaches with predefined pattern templates produce better results than purely reactive frame-by-frame mapping**. The key insight from IMFAS: "Automatically generated scenarios may lack artistic coherence" — which means the algorithm must encode aesthetic principles, not just audio-reactive thresholds.

### The three-layer choreography algorithm

The recommended algorithm operates on three hierarchical layers:

**Layer 1 — Section-level theme assignment** (runs once per song). After MSAF segments the song into sections, assign each section a "choreographic theme" that determines which fountain elements are active and at what intensity range:

```
INTRO:     Subtle — Center Jet only, low height, cool colors (blue/cyan)
VERSE:     Rhythmic — Ring Fountains + Organ Fountains, beat-synced, moderate intensity
PRE-CHORUS: Building — Progressively activate more elements, rising heights
CHORUS:    Maximum spectacle — ALL elements active, full height, warm colors (red/gold)
BRIDGE:    Unique — Butterfly/Moving Head + Mist Lines, unusual patterns
OUTRO:     Wind-down — Gradual deactivation, return to Center Jet, fade to blue
```

**Layer 2 — Beat-synchronized valve choreography** (runs per beat). On each detected beat onset, trigger valve-based effects according to the current section theme:

```python
def process_beat(beat_time, onset_strength, section_theme):
    if onset_strength > STRONG_THRESHOLD:
        # Dramatic burst — fire all jets in current theme's active set
        for valve in section_theme.active_valves:
            schedule_valve(valve, ON, beat_time)
            schedule_valve(valve, OFF, beat_time + 300)  # 300ms pulse
    elif onset_strength > MEDIUM_THRESHOLD:
        # Alternating pattern — cycle through valve groups
        group = section_theme.next_valve_group()
        for valve in group:
            schedule_valve(valve, ON, beat_time)
            schedule_valve(valve, OFF, beat_time + 200)
```

**Layer 3 — Continuous energy-to-height mapping** (runs per frame at 40 fps). Map frequency band energies to VFD speeds with smoothing:

```python
def compute_jet_heights(frame, bass_energy, mid_energy, treble_energy, section):
    # Normalize energies to 0.0-1.0 range (per-song normalization)
    bass_norm = (bass_energy - bass_min) / (bass_max - bass_min)
    
    # Apply square-root correction for height-to-speed relationship
    center_jet_speed = sqrt(bass_norm) * section.max_intensity
    
    # Exponential moving average for smooth transitions (avoid jarring changes)
    alpha = 0.15  # smoothing factor — lower = smoother
    center_jet_speed = alpha * center_jet_speed + (1 - alpha) * prev_center_speed
    
    # Convert to DMX value (0-255)
    center_jet_dmx = int(clamp(center_jet_speed * 255, 0, 255))
    
    # Enforce VFD ramp rate constraint: max 10 Hz/second change
    center_jet_dmx = apply_ramp_limit(center_jet_dmx, prev_dmx, max_change_per_frame=6)
    
    return center_jet_dmx
```

### RGB LED color choreography

Research on music-to-color mapping suggests using **Russell's Circumplex Model of Affect** combined with Itten's color system. The approach from Dharmapriya et al. maps two dimensions — **Valence** (musical positivity) and **Arousal** (energy level) — to coordinates in a color wheel:

- **High arousal + positive valence** (energetic chorus): warm colors — red, orange, gold
- **High arousal + negative valence** (intense/dark section): deep purple, magenta
- **Low arousal + positive valence** (gentle verse): light blue, green, soft pink
- **Low arousal + negative valence** (melancholic bridge): deep blue, indigo

For practical implementation, compute a **base color from the section's mood** (using Essentia's pre-trained mood classifiers or spectral brightness as a proxy), then modulate **saturation by energy level** and **trigger color changes on beat onsets**. High-frequency energy maps to color temperature — more treble shifts colors warmer. The **beat-to-strobe** mapping uses onset strength: strong onsets trigger sharp color changes, weak onsets produce gentle color fades.

### Aesthetic coherence principles

Encoding these rules prevents the "random noise" problem:

- **Symmetry**: mirror fountain patterns around the center axis (if left Peacock Tail fires, right must also)
- **Minimum hold time**: any activated effect stays on for at least 500ms regardless of audio — brief flickers look like glitches
- **Crescendo detection**: when RMS energy increases steadily over 4+ seconds, progressively activate elements rather than reacting frame-by-frame
- **Silence respect**: when energy drops below 10% of song average for >1 second, reduce to minimal effects (Center Jet at 20%, cool blue lighting)
- **Climax conservation**: reserve the most dramatic effects (all 24 High Jets at full height + all RGB white strobe) for the single highest-energy moment in the song

---

## 4. Three.js particle systems simulate realistic fountain effects in the browser

### GPU-driven particle architecture

The recommended approach uses **THREE.Points with custom ShaderMaterial** where particle physics are computed entirely on the GPU. The vertex shader receives initial position, velocity, and acceleration as buffer attributes, then computes position at time *t* using the kinematic equation `p(t) = p₀ + v₀t + ½at²`. The CPU only updates a single `time` uniform each frame — **eliminating the CPU-GPU transfer bottleneck** that limits JavaScript-side particle updates to roughly 50,000 particles.

For the target fountain with ~13 distinct nozzle types, a **particle budget of 30,000–50,000** active particles provides good visual quality while maintaining 60 fps on mid-range hardware. Each fountain pattern maps to a specific emitter configuration:

**Vertical jets** (Center Jet, 24 High Jets): point emitters with velocity = `(0, V, 0)` where `V = √(2g × targetHeight)`. Height is controlled by scaling V proportional to the DMX channel value.

**Fan-shaped sprays** (Peacock Tail): multiple streams in a 120–180° arc, each with a fixed angle. For N streams: `angle_i = startAngle + i × (arcWidth / (N-1))`, velocity = `(speed × sin(angle), speed × 0.8, speed × cos(angle))`.

**Rotating nozzles** (Revolving Fountain): emitter position orbits the center point at `(R×cos(ωt), 0, R×sin(ωt))` with velocity directed radially outward plus an upward component.

**Ring Fountains**: N emitters equally spaced on a circle, all firing upward. Chase effects stagger start times: `delay_i = i × (cyclePeriod / N)`.

**Mist Lines**: billboard sprites with soft Gaussian-falloff textures, near-zero velocity, `THREE.AdditiveBlending`, and alpha fade over particle lifetime.

### Audio synchronization in the browser

The **Web Audio API's AudioContext.currentTime** provides hardware-precision timing (~0.01ms accuracy from a crystal oscillator) and serves as the single source of truth for synchronization. During playback, each `requestAnimationFrame` callback reads `audioContext.currentTime`, looks up the corresponding frame in the pre-computed choreography timeline, and updates fountain parameters accordingly. For reactive real-time effects, an `AnalyserNode` provides live FFT frequency data that can modulate particle colors and bloom intensity.

**Theatre.js** is recommended for the timeline playback system — it provides built-in Web Audio synchronization via `sequence.attachAudio()`, a visual timeline editor for debugging, and React Three Fiber integration.

### RGB lighting with bloom post-processing

With 150 RGB lights, creating individual `THREE.PointLight` objects would devastate performance. Instead, encode all **150 light positions and colors as shader uniforms** (or a data texture). The particle fragment shader loops through nearby lights and accumulates color contribution based on distance attenuation. **UnrealBloomPass** post-processing adds the crucial "glow on water" effect: set water particle emissive values above 1.0 so they trigger the bloom threshold, while keeping ground/environment materials below 1.0 for selective bloom.

### Importing fountain layouts

For image uploads: load as a textured `THREE.PlaneGeometry` ground plane, then let users click to place nozzle markers. For DXF files: the **three-dxf-loader** npm package parses AutoCAD DXF files and returns Three.js mesh entities, extracting circle entities as nozzle positions and polylines as pool boundaries. For SVG: Three.js's built-in `SVGLoader` extracts path data. All approaches ultimately produce a JSON array of nozzle positions: `[{id, type, x, z, angle, maxHeight}]`.

---

## 5. A polyglot microservice architecture keeps costs under $300/month at launch

### Core technology choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14+ (TypeScript) + React Three Fiber | SSR for SEO, declarative Three.js, massive ecosystem |
| API gateway | NestJS (TypeScript) | Structured backend, WebSocket support for progress updates |
| Audio processing | Python FastAPI + Celery workers | Librosa/madmom ecosystem, async task queue |
| Database | PostgreSQL 16 with JSONB | Hybrid relational + flexible config storage |
| Queue | RabbitMQ or Amazon SQS | Reliable async job dispatch |
| Storage | Amazon S3 | Audio files, generated show packages, layout files |
| Auth | Clerk (with Clerk Billing) | Built-in Stripe integration, B2B organizations, React components |
| Compute workers | ECS Fargate or Google Cloud Run | Container-based, auto-scaling, no Lambda size limits |

The polyglot approach — **Python for audio/ML processing, Node.js for API/real-time** — leverages each ecosystem's strength. Audio analysis tasks are dispatched via message queue to Python FastAPI workers running in Docker containers with librosa, madmom, FFmpeg, and scipy pre-installed. The NestJS API handles authentication, file upload orchestration, WebSocket connections for real-time job progress, and serves the React Three Fiber frontend.

### Processing pipeline flow

```
User uploads MP3 → Presigned S3 URL (direct upload, bypasses server)
  → S3 event → SQS message → Python worker container
    → FFmpeg decode → librosa analysis → madmom beat tracking → MSAF segmentation
    → Choreography engine (mapping algorithm) → Control code generator
    → Results: JSON timeline + DMX binary + Modbus sequence → S3
    → PostgreSQL job status update → Redis pub/sub → WebSocket → Client notification
```

### Database design highlights

The schema uses a **hybrid approach**: stable, queryable fields as typed PostgreSQL columns (project name, duration, status) and variable configuration data as JSONB columns (nozzle arrays, hardware specs, choreography timelines). A `fountain_configs` table stores nozzle definitions as JSONB arrays with GIN indexes for containment queries. Audio analysis results (beat arrays, onset timestamps, band energies) are stored as JSONB in an `audio_analyses` table. For very large choreography timelines (40 fps × 300 seconds = 12,000 frames), the timeline data is stored as a compressed JSON file in S3 with only metadata in PostgreSQL.

Multi-tenancy uses the **shared database, tenant-discriminator column** pattern with PostgreSQL Row-Level Security policies enforcing data isolation via `org_id`.

### Cost structure at launch

At early stage (~100 users, ~500 analyses/month), infrastructure costs approximately **$200–300/month**: Vercel Pro for frontend ($20), a single ECS Fargate API instance ($35–50), on-demand audio processing workers ($15–40 total — each 60-second analysis costs roughly $0.003 on Cloud Run), RDS PostgreSQL ($65), Redis ($15), SQS ($1–5), S3 storage ($5), and CloudFront CDN ($5–10). Clerk's free tier supports up to 50,000 monthly active users. At growth stage (~1,000 users), costs scale to approximately **$750–1,100/month**, with audio processing compute as the primary variable cost.

---

## Conclusion: a technically grounded path from prototype to product

Three strategic decisions will determine success. First, **generate DMX timeline data as your primary output format** — this is the proven industry standard that professional fountain controllers from Crystal Fountains, Syncronorm, and others all consume. Resist the temptation to invent a proprietary protocol. Second, **invest heavily in the section-aware choreography algorithm** rather than purely reactive frame-by-frame mapping. The research literature is clear that automated systems without structural awareness produce "prosaic" results that professionals won't use. Template-based patterns assigned at the section level, with beat-synchronized triggering and continuous energy-to-height modulation within those templates, strike the right balance between automation and aesthetic quality. Third, **build the 3D simulator as a first-class product feature**, not an afterthought — Crystal Fountains' WATERlab and Syncronorm's Depence prove that visualization is what sells fountain shows to clients, and a browser-based preview accessible via link eliminates the "several trial runs" problem that makes traditional fountain programming so expensive.

The one genuinely hard unsolved problem is making automated choreography match human artistic sensibility. The IMFAS researchers acknowledged this honestly. A pragmatic approach: ship rule-based automation as the default, then add a timeline editor (modeled on Depence) for manual refinement. Over time, collect human-edited show data as training data for ML models that learn what makes choreography aesthetically pleasing — but don't wait for ML to ship version one.