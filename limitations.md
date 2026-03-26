# Limitations — FountainFlow

Known constraints, technical boundaries, and things the system intentionally does NOT do. Check here before filing a bug — it might be by design.

---

## 1. Audio analysis limitations

### 1.1 Beat detection accuracy varies by genre

madmom's RNN beat tracker achieves ~90% accuracy on Western pop/rock with clear percussion. Accuracy drops for:

| Genre | Expected accuracy | Why |
|-------|------------------|-----|
| Western pop/rock/EDM | 88-93% | Clear drum patterns, 4/4 time signature |
| Bollywood film music | 80-88% | Tabla rhythms, tempo changes, mixed meters |
| Classical Western | 70-80% | No drums, rubato (intentional tempo variation) |
| Classical Indian (raga) | 65-75% | Complex tala cycles, no clear downbeat |
| Free jazz | 50-65% | Intentionally irregular rhythm |
| Ambient/drone | < 50% | No discernible beat structure |

**Impact:** Missed beats mean some musical accents won't trigger fountain effects. Extra false beats cause unnecessary valve activations. Both result in a show that feels slightly "off" but still functional.

**Mitigation for v2:** Allow users to upload a beat map (tap along to the song) or manually adjust detected beats in a timeline editor.

### 1.2 Section detection is approximate

MSAF identifies section boundaries with a tolerance of ±2 seconds. For songs with ambiguous structure (continuous build without clear verse/chorus distinction), sections may be over-segmented (too many short sections) or under-segmented (treating verse + chorus as one long section).

**Impact:** Section theme assignments may switch at slightly wrong moments. A chorus might start with "verse" choreography for 2 seconds before switching.

**Mitigation:** The choreography engine applies 1-second crossfade transitions between sections, masking imprecise boundaries.

### 1.3 Maximum song length: 45 minutes

The system accepts files up to 45 minutes. Beyond this:
- Memory usage exceeds practical limits for typical worker containers (> 2 GB for librosa load)
- madmom processing time exceeds 20 minutes
- Timeline data becomes very large (> 15 MB for JSON)
- 3D simulation data would require streaming/chunking beyond current implementation

**Workaround for longer shows:** Split into multiple files and process separately.

### 1.4 Mono analysis only

All audio is downmixed to mono for analysis. Stereo information (panning, stereo effects) is lost. This is standard practice in MIR (Music Information Retrieval) — beat detection and frequency analysis work identically on mono signals.

**Impact:** None for choreography quality. Stereo effects in the original song don't affect fountain behavior.

### 1.5 No lyrics analysis

The system is completely language-agnostic by design — it analyzes acoustic properties (frequency, energy, rhythm) not linguistic content. It cannot:
- Detect sung words or phrases
- Trigger effects on specific lyrics ("fire" → flames effect)
- Handle spoken-word sections differently from instrumental

---

## 2. Choreography limitations

### 2.1 Rule-based, not AI-creative

The v1 choreography engine uses predefined rules and pattern templates. It does NOT "understand" music the way a human choreographer does. Specific things it cannot do:

- **Interpret musical emotion nuance:** It maps broad energy/frequency features to effects, not subtle musical meaning. A sad violin melody and a happy flute melody at the same frequency/energy get similar treatment.
- **Tell a story:** Human choreographers create narrative arcs (build tension, release, surprise). The system applies section-level themes but doesn't construct narrative.
- **Handle unusual structures:** Songs without clear verse/chorus structure (through-composed, freeform, spoken word over music) get generic choreography.
- **Create asymmetric effects for artistic purpose:** The symmetry rule always mirrors effects left-right. Sometimes asymmetry is more interesting, but the system always chooses safety.

### 2.2 Fixed pattern templates per section type

The system has ~6 section themes (intro, verse, pre-chorus, chorus, bridge, outro). Each theme has 3-4 pattern variations. This means two different "chorus" sections in different songs will use similar patterns. Over time, shows may feel samey.

**Mitigation for v2:** User-created pattern templates, AI-suggested variations, and a learning system that adapts based on human edits.

### 2.3 No multi-fountain coordination

Each show is generated for one fountain. If a venue has multiple fountains (e.g., a main fountain + flanking smaller fountains), they must be choreographed separately with manual timing alignment.

### 2.4 Laser choreography is basic

Laser shows require specialized programming (ILDA protocol, beam safety zones, scanner speed limits). FountainFlow only controls laser on/off and RGB color via DMX. Complex laser patterns, beam effects, and animations are out of scope.

### 2.5 No water screen projection content

The system can trigger the water screen pump (on/off via DMX) but does NOT generate video content for the HD projector. Video projection mapping is a separate discipline requiring different tools.

---

## 3. Code generation limitations

### 3.1 Arduino Mega pin count

Arduino Mega 2560 has 54 digital I/O pins and 15 PWM pins. A large fountain (38 valves + 9 VFDs + 150 LEDs + 2 lasers) exceeds this:
- 38 valve pins (digital) = 38 pins
- 9 VFD pins (PWM) = 9 pins
- LED data (1 pin for NeoPixel/WS2812 daisy chain, or 1 pin for DMX)
- Laser control (2 pins)
- SD card SPI (4 pins)
- **Total: ~53 pins** — barely fits

**For larger fountains:** Use shift registers (74HC595) to expand digital outputs, or switch to ESP32 with I/O expanders, or use a dedicated DMX controller instead of Arduino.

### 3.2 Arduino timing precision

Arduino's `millis()` has ~1ms precision, which is sufficient for 40fps (25ms per frame). However, if the Arduino is doing heavy I/O (reading SD card + writing 50 output pins + driving NeoPixel strip), timing jitter can reach 5-10ms.

**Impact:** Slight drift between audio playback and fountain effects over long shows. For a 40-minute show, accumulated drift could reach 0.5-2 seconds.

**Mitigation:** Use hardware timer interrupts for frame timing instead of `millis()` polling. The generated code includes a comment suggesting this but doesn't implement it by default (requires per-board configuration).

### 3.3 No firmware upload from browser

The user must download the generated code and upload it to their hardware manually using:
- Arduino IDE (for .ino files)
- PlatformIO (for ESP32)
- Their DMX controller software (for Art-Net binary)

Web Serial API support (flashing directly from browser) is technically possible but not implemented in v1.

### 3.4 Generated code is not optimized for specific VFD brands

The Modbus command sequence uses generic Modbus RTU addresses. Different VFD brands (Danfoss, ABB, Siemens, Schneider) use different register addresses for speed reference. The generated code includes a mapping table that the installer must customize for their specific VFD model.

---

## 4. 3D simulation limitations

### 4.1 Not physically accurate water simulation

The particle system approximates water visually. It does NOT simulate:
- Fluid dynamics (no Navier-Stokes)
- Water surface interaction (splash, ripples)
- Wind effects on water jets
- Water-to-water collision (jets crossing each other)
- Foam, spray, or fine mist physics
- Gravity variations based on nozzle pressure

**What it DOES simulate accurately:**
- Parabolic trajectory of water jets (kinematic equation)
- Jet height proportional to pump speed² (pump affinity law)
- RGB light color on water particles (additive blending)
- Timing synchronization with audio

### 4.2 Performance varies by device

| Device tier | Expected FPS | Particle budget |
|-------------|-------------|----------------|
| Gaming PC (dedicated GPU) | 60 fps | 50,000 |
| Modern laptop (integrated GPU) | 45-60 fps | 30,000 |
| Older laptop / Chromebook | 20-35 fps | 15,000 |
| Mobile phone (modern) | 25-40 fps | 10,000 |
| Mobile phone (older) | < 20 fps | 5,000 |

The system auto-detects GPU capability and reduces particle count accordingly. On very low-end devices, the simulation may look sparse.

### 4.3 No VR/AR support

The 3D simulation is a standard WebGL canvas. No WebXR, no stereoscopic rendering, no AR overlay on real fountain video.

### 4.4 Bloom post-processing limitations

The UnrealBloomPass effect (glowing water under RGB lights) is GPU-intensive. On low-end devices, bloom is automatically disabled, resulting in flat-colored particles without the "glow on water" effect.

### 4.5 No saved camera paths

The user can orbit the camera freely but cannot save or replay specific camera movements. Auto-rotate is available but follows a fixed circular path.

---

## 5. Platform/infrastructure limitations

### 5.1 Upload size limit

Maximum uploaded audio file size: 200 MB. This covers:
- 45-minute WAV file at 44.1 kHz/16-bit stereo: ~450 MB → rejected, convert to MP3 first
- 45-minute MP3 at 320 kbps: ~108 MB → accepted
- 45-minute FLAC: ~150-300 MB → may be rejected, recommend MP3

**Recommendation:** Always upload MP3 or AAC for files > 15 minutes.

### 5.2 Concurrent processing

At launch scale (1-2 worker containers), the system processes jobs sequentially. If 5 users submit simultaneously, the 5th user waits for the first 4 to complete. Processing queue is FIFO.

**At growth scale:** Auto-scaling worker containers handle concurrent jobs, but each worker needs 2-4 GB RAM for long songs.

### 5.3 No real-time collaboration

Only one user can work on a project at a time. No simultaneous editing, no live cursor sharing, no conflict resolution.

### 5.4 Browser support

Requires WebGL 2.0 and Web Audio API:
- Chrome 80+ ✓
- Firefox 78+ ✓
- Safari 15+ ✓
- Edge 80+ ✓
- Internet Explorer — NOT supported
- Opera Mini — NOT supported

### 5.5 Data retention

- Audio files are deleted 30 days after last project access
- Generated show packages are kept for 90 days
- Project metadata is kept indefinitely while account is active
- No audio file is ever shared between users or used for training

---

## 6. What we explicitly will NOT build (v1)

| Feature | Why not |
|---------|---------|
| Manual timeline editor | Requires building a full DAW-like UI — Phase 5 or v2 |
| Real-time audio reactive mode | Conflicts with pre-computed architecture, lower quality |
| Mobile native app | Web is sufficient, mobile browser works |
| Multi-fountain sync | Requires precise clock synchronization between controllers |
| Custom nozzle physics | Would need per-nozzle flow simulation — academic research territory |
| Video projection content | Entirely different product category |
| Karaoke-style lyrics overlay | Requires speech recognition, different product |
| Social sharing / public gallery | Privacy and copyright concerns with uploaded music |

---

## 7. Known bugs and workarounds (to be updated during development)

### BUG-001: NestJS DTO rejected valid FountainConfig (project creation always returned 400)
**Status:** Fixed 2026-03-25
**Workaround:** N/A (fixed)
**Root cause:** `create-project.dto.ts` used wrong nozzle type enum values (`jet/fan/ring` instead of `center_jet/high_jet` etc.), `max_height_m` instead of `max_height_ft`, and `position: {x,y,z}` instead of `positions: [{x,y}]` — schema did not match `@fountainflow/shared` types.

### BUG-002: pdfjs-dist v5 crashes Next.js webpack (both RSC and client-side bundlers)
**Status:** Fixed 2026-03-26 — moved PDF extraction to server-side Python
**Workaround:** N/A (fixed)
**Root cause:** pdfjs-dist v5 uses ESM with `Object.defineProperty` on its exports object, which crashes Next.js webpack's module processing. Client-side dynamic import with CDN URL also failed (version not on cdnjs). Final fix: PDF text extraction runs server-side via Python (pymupdf + tesseract) through a Next.js API route, no browser-side PDF library needed.

### BUG-003: llava vision model cannot read CAD blueprint text
**Status:** Fixed 2026-03-26 — replaced with tesseract OCR
**Workaround:** N/A (fixed)
**Root cause:** llava 7B is not accurate enough for small rotated text in CAD dimension annotations. Returned empty category headers. Replaced with tesseract OCR at 0° + 180° rotations which correctly extracts all nozzle names and dimension numbers.

### BUG-004: Ollama qwen2.5:14b returns single object when `format:"json"` is set
**Status:** Fixed 2026-03-26
**Workaround:** Remove `format:"json"` from Ollama request; extract JSON array from response with regex `/\[[\s\S]*\]/`
**Root cause:** With `format:"json"`, qwen2.5:14b interprets the JSON constraint as "return a JSON object" and wraps the first nozzle in an object. Without the format constraint, the model correctly returns an array when instructed to start with `[`.

### 8. PDF blueprint import limitations

The PDF/DOCX blueprint import feature has specific requirements and limitations:

**Requirements:**
- **tesseract** must be installed on the server machine (`brew install tesseract` on macOS)
- **Ollama** must be running locally with **qwen2.5:14b** downloaded
- Both are optional — text DOCX import works without them

**Limitations:**
- Image-only PDFs work best when the blueprint uses standard CAD label placement (nozzle names near elements, dimension lines with numbers)
- AI-extracted positions are **estimates** — always review the nozzle table before confirming
- OCR quality depends on the PDF's image resolution; low-resolution scans (<150 DPI) may produce garbled text
- Very complex blueprints with dense overlapping labels may confuse the AI's position calculation
- qwen2.5:14b takes 60–120 seconds on Apple Silicon (M2/M3 with 18 GB RAM) — this is expected
