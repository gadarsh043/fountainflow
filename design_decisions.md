# Design Decisions — FountainFlow

Every non-obvious technical choice is documented here with the reasoning. When facing a new decision, check here first — the pattern may already be established.

---

## DD-001: Polyglot architecture (Python worker + Node.js API)

**Decision:** Use Python for audio analysis and choreography, Node.js/TypeScript for API and frontend.

**Why not all Python?** The audio analysis ecosystem is exclusively Python. librosa, madmom, and MSAF have no JavaScript equivalents of comparable quality. madmom's RNN-based beat tracker consistently ranks #1 in MIREX competitions — there is nothing close in the JS ecosystem.

**Why not all Node.js?** We tried evaluating Meyda and Essentia.js for server-side analysis. Meyda lacks beat tracking and section detection entirely. Essentia.js (WebAssembly) works in browsers but has limited server-side support and no section segmentation.

**Why Node.js for API?** WebSocket support for real-time job progress, massive ecosystem for auth (Clerk SDK), file handling, and the frontend is React/Next.js anyway — sharing types between frontend and API via a TypeScript monorepo eliminates a whole class of bugs.

**Communication:** The API server dispatches jobs to the Python worker via a message queue (BullMQ/Redis or SQS). The worker writes results to S3 and updates job status in PostgreSQL. No direct HTTP calls between API and worker — fully decoupled.

**Alternatives considered:**
- All Python (Django/FastAPI) — rejected because Three.js integration, WebSocket handling, and React SSR are stronger in Node.js
- Go worker — rejected because librosa/madmom don't exist in Go
- Elixir API — rejected because team expertise and ecosystem size

---

## DD-002: Pre-computed analysis over real-time

**Decision:** Analyze the entire song server-side before generating choreography. No real-time audio analysis during playback.

**Why:** Pre-computation enables non-causal algorithms — madmom's RNN looks both forward and backward in the audio stream, which is impossible in real-time. MSAF's section detection requires the entire song to compute self-similarity matrices. The choreography engine needs to know where the climax is (to reserve maximum effects) and where crescendos happen (to build progressively). None of this works in real-time.

**Real-time in browser is only for visualization enhancement:** The Web Audio API's AnalyserNode provides live FFT during playback, which we use to modulate particle bloom intensity and color saturation — purely cosmetic additions on top of the pre-computed choreography.

**Tradeoff:** Users wait 1-15 minutes for processing instead of getting instant results. We mitigate with clear progress bars showing each pipeline stage.

---

## DD-003: DMX512 as primary output abstraction

**Decision:** The choreography engine thinks in DMX terms internally — 512 channels per universe, 8-bit values (0-255), 40 fps frame rate — even when the final output is Arduino code or JSON.

**Why:** DMX512 is the universal standard in the fountain industry. Crystal Fountains' WATERlab, Syncronorm's Depence, Symphony Fountains — they all speak DMX. By using DMX as our internal abstraction, our output is directly compatible with professional hardware. The code generators then translate DMX channel values to platform-specific output (Arduino digital pins, ESP32 PWM, etc.).

**Implication:** Every actuator gets a DMX address during configuration, even if the user's hardware doesn't use actual DMX. This address is used internally for the timeline data structure. The code generator maps DMX addresses to physical pins/outputs.

---

## DD-004: Three-layer choreography over single-pass reactive mapping

**Decision:** Use a three-layer hierarchical algorithm (section themes → beat scheduling → continuous energy mapping) instead of a simple "map frequency to output" reactive approach.

**Why:** The IMFAS research paper (Yfantis et al.) demonstrated that purely reactive systems produce "prosaic" shows. The Self-Choreographed Musical Fountain System paper confirmed that predefined pattern templates matched to song sections produce better results than frame-by-frame mapping. Professional choreographers at companies like Forme d'Acqua emphasize that the "anatomy of a song" — its structural sections and dynamic contrasts — is the foundation of good fountain choreography.

**The three layers:**
1. **Section themes** (runs once) — assigns which fountain elements are active in each section and at what intensity range. This prevents the "everything fires all the time" problem.
2. **Beat scheduling** (runs per beat) — triggers valve-based effects synchronized to detected beats. Uses onset strength to vary between subtle and dramatic patterns.
3. **Continuous energy mapping** (runs per frame at 40 fps) — smoothly varies VFD speeds based on band energies. Applies square-root correction for the pump affinity law.

**Aesthetic coherence rules** run as post-processing constraints: symmetry enforcement, minimum hold times, crescendo detection, silence respect, climax conservation.

---

## DD-005: GPU-driven particles over CPU-side particle updates

**Decision:** Compute all particle physics in the vertex shader, sending only a time uniform from CPU each frame.

**Why:** JavaScript-side particle updates hit a hard wall at ~50,000 particles due to the CPU-GPU data transfer bottleneck. With GPU-driven particles, the CPU sends a single float (time) per frame, and the vertex shader computes `p(t) = p₀ + v₀t + ½at²` for every particle in parallel. This easily handles 50,000+ particles at 60fps.

**What goes to the GPU once (buffer attributes):**
- Initial position (vec3) — emitter position
- Initial velocity (vec3) — determined by nozzle type and DMX value
- Birth time (float) — staggered for continuous emission
- Lifetime (float) — how long before particle recycles
- Random seed (float) — for per-particle variation

**What updates every frame (uniforms):**
- Current time (float)
- Per-emitter height multiplier (float array) — driven by DMX channel values
- Per-emitter active state (bool array) — valve open/closed

**Tradeoff:** Particle behavior is limited to kinematic equations. No inter-particle collision, no fluid dynamics, no splash effects. This is acceptable — we're simulating visual appearance, not physics.

---

## DD-006: SD card storage for Arduino show data

**Decision:** Arduino show data is stored on an SD card and read frame-by-frame during playback, not compiled into program memory.

**Why:** Arduino Mega has 8 KB SRAM and 256 KB flash. A 3-minute show at 40fps with 50 channels = 7,200 × 50 = 360,000 bytes (352 KB) — exceeds flash entirely. A 40-minute show would be 4.7 MB. SD cards solve this completely: read one frame (50 bytes), apply outputs, read next frame.

**Format:** Binary file with fixed-size frames. Each frame is a sequence of uint8 channel values. Frame rate is embedded in the header. The Arduino reads `frame_size` bytes every `1000/frame_rate` milliseconds.

**For ESP32:** Same concept but uses SPIFFS/LittleFS filesystem on the ESP32's flash. ESP32-WROOM has 4 MB flash, enough for ~10-minute shows. Longer shows require SD card.

---

## DD-007: Clerk for authentication over custom auth

**Decision:** Use Clerk for authentication, organization management, and billing integration.

**Why:** Building custom auth (JWT, password hashing, email verification, password reset, OAuth, organization/team management, Stripe billing integration) would take 3-4 weeks minimum and ongoing maintenance. Clerk provides all of this out-of-the-box with a free tier supporting 50,000 MAU. The React components (`<SignIn/>`, `<UserButton/>`) integrate seamlessly with Next.js. Clerk Billing wraps Stripe, eliminating the need to build a separate billing system.

**Risk:** Vendor lock-in. Mitigated by keeping auth logic behind an abstraction layer — the API server verifies JWT tokens and extracts user/org IDs, without importing Clerk-specific code into business logic.

---

## DD-008: JSONB for variable fountain configuration data

**Decision:** Store fountain configurations as JSONB columns in PostgreSQL, not as fully normalized relational tables.

**Why:** Fountain configurations are deeply variable. One fountain might have 24 high jets arranged in a circle; another has 8 in a line. One has 150 RGB LEDs; another has 50 single-color lights. Normalizing this into relational tables would require ~15 tables with complex joins. JSONB gives us:
- Schema flexibility: different fountains have different structures
- GIN indexes for efficient queries (`WHERE config @> '{"nozzles": [{"type": "center_jet"}]}'`)
- No joins for config retrieval (single row fetch)
- Easy versioning (store full config snapshots)

**What stays relational:** project name, user_id, org_id, status, created_at, duration_ms — anything we query, filter, or sort by.

**What goes in JSONB:** nozzle arrays, pump specs, LED configurations, DMX channel mappings, choreography parameters.

---

## DD-009: Song boundary detection for stitched files

**Decision:** Support stitched multi-song files (40+ minutes) by detecting silence gaps as song boundaries.

**Why:** Real fountain shows often run 20-30 minutes with multiple songs played back-to-back. Users should be able to upload a single pre-mixed audio file rather than uploading songs individually.

**Detection method:** After computing the RMS energy envelope, scan for contiguous regions where energy drops below 2% of the song's mean energy for longer than 800ms. These are marked as song boundaries. The choreography engine treats each segment between boundaries as an independent song with its own section analysis and theme assignment.

**Intermission choreography:** Between detected songs, insert a 2-3 second choreographic reset: fade all effects to minimal (center jet at 10%, cool blue), then ramp up for the new song's intro.

**Edge case:** Some songs have intentional silence (dramatic pause). To avoid false positives, we require > 800ms of near-silence AND a significant change in spectral characteristics across the boundary (measured by spectral centroid shift).

---

## DD-010: Rule-based choreography first, AI refinement later

**Decision:** Ship v1 with pure rule-based choreography. Use AI (Claude API) as an optional refinement layer, not the primary engine.

**Why:** Rule-based systems are deterministic, debuggable, and fast. The IMFAS and SSRG papers both used rule-based approaches successfully. AI-generated choreography is non-deterministic — the same song could produce different results on different runs, making debugging and user expectations harder to manage.

**AI role in v1:** Optional "style suggestion" endpoint. Send the audio analysis JSON + fountain config to Claude API and ask it to suggest section theme assignments (which choreographic template for each section). The user can accept or modify these suggestions. The actual timeline generation is always deterministic rule-based.

**AI role in v2+:** As we collect human-edited show data from the timeline editor (Phase 5), we can fine-tune a model to learn what makes choreography aesthetically pleasing. This is a genuine ML training opportunity — but we don't need it to ship v1.

---

## DD-011: 40fps frame rate matches DMX refresh rate

**Decision:** Use 40 frames per second as the universal frame rate throughout the system.

**Why:** DMX512 refreshes at approximately 44 fps (1 frame ≈ 23ms at maximum throughput). Using 40fps aligns closely with DMX timing while being a cleaner number for frame counting (40 frames = 1 second, easy mental math). It's also high enough for smooth VFD speed changes and LED color transitions, while keeping data sizes manageable.

**Implications:**
- 3-minute show = 7,200 frames
- 40-minute show = 96,000 frames
- Timeline JSON at 40fps with 500 channels = ~4.5 MB for 3 minutes (pre-compression)
- We use keyframe interpolation in the timeline (not dense per-frame data) to reduce size by ~90%

---

## DD-012: Monorepo with Turborepo

**Decision:** Single repository with Turborepo managing three apps and one shared package.

**Why:** The shared types package (`@fountainflow/shared`) contains TypeScript interfaces used by both the Next.js frontend and NestJS API. Changes to these types should trigger rebuilds of both consumers. Turborepo handles this dependency graph automatically. It also provides unified commands (`pnpm dev` starts everything) and caches build artifacts.

**Python worker is NOT managed by Turborepo** — it sits in the monorepo directory but has its own virtualenv, Dockerfile, and test runner. Turborepo only knows about it for the `pnpm dev` script (which starts uvicorn alongside the Node services).

---

## Appendix: Decisions NOT made yet (to be resolved during development)

- **Timeline editor UI:** Should we build a custom timeline editor (like Depence) or use an existing library (Theatre.js, Lottie)? Deferred to Phase 5.
- **Collaborative editing:** Should multiple team members edit the same show? Deferred to v2.
- **Offline mode:** Should the 3D simulation work offline (PWA)? Deferred to v2.
- **Custom choreography patterns:** Should users be able to create and share their own pattern templates? Deferred to v2.
