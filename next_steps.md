# Next Steps — Manual Actions Required

These are things that require human action — account creation, API key generation, hardware decisions, or manual verification that cannot be automated.

---

## 1. Environment setup (BEFORE first run)

### 1.1 Create accounts and get API keys

| Service | Action | Where it goes in .env | Free tier? |
|---------|--------|----------------------|------------|
| **Clerk** | Create account at clerk.com → Create application → Get keys | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes, 50k MAU |
| **AWS S3** (or Cloudflare R2) | Create bucket, create IAM user with S3 access | `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Free tier: 5 GB |
| **Anthropic** (optional) | Get API key at console.anthropic.com | `ANTHROPIC_API_KEY` | Pay-per-use, ~$0.01/request |

**For local development only:** You can skip AWS S3 and use MinIO (included in docker-compose.yml). Default credentials are `minioadmin/minioadmin`.

### 1.2 Install system dependencies

These must be installed on your development machine (not just npm/pip packages):

```bash
# macOS
brew install ffmpeg python@3.11 node@20 pnpm

# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg python3.11 python3.11-venv python3-pip
# Node.js 20: use nvm or nodesource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs
npm install -g pnpm

# Windows
# Install FFmpeg from https://ffmpeg.org/download.html (add to PATH)
# Install Python 3.11 from python.org
# Install Node.js 20 from nodejs.org
# npm install -g pnpm
```

**Verify installations:**
```bash
ffmpeg -version    # Should show 5.x or 6.x
python3 --version  # Should show 3.11+
node --version     # Should show v20+
pnpm --version     # Should show 9+
```

### 1.3 Create .env file

```bash
cp .env.example .env
```

Then fill in the values from step 1.1. The minimum required for local development:

```bash
# Database (Docker Compose provides this)
DATABASE_URL=postgresql://fountainflow:fountainflow@localhost:5432/fountainflow

# Redis (Docker Compose provides this)
REDIS_URL=redis://localhost:6379

# Storage (MinIO via Docker Compose for local dev)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=fountainflow-dev
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Auth (REQUIRED — get from clerk.com)
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx

# Optional
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

---

## 2. Decisions that need human input

### 2.1 Domain name and branding

- [ ] Register domain (suggestions: fountainflow.io, fountainflow.dev, flowchoreographer.com)
- [ ] Design logo
- [ ] Choose brand colors (current suggestion: deep blue #185FA5 + coral #D85A30)

### 2.2 Pricing validation

The pricing model in product_spec.md is a draft. Before launch:
- [ ] Interview 5-10 potential customers (Indian fountain companies, event planners)
- [ ] Validate willingness to pay $29-99/month
- [ ] Decide if per-show pricing ($5-20 per show) works better than subscription
- [ ] Set free tier limits (currently: 3 shows/month, 5-min max)

### 2.3 Test with real fountain hardware

Before claiming "works with Arduino" — someone must:
- [ ] Build a small test fountain (3-5 nozzles, 1 pump, 5 LEDs)
- [ ] Upload generated Arduino code to a real Mega 2560
- [ ] Play the song and verify sync
- [ ] Measure actual timing drift over a 5-minute show
- [ ] Document any wiring issues or pin assignment problems

### 2.4 Test audio corpus

- [ ] Collect 20-30 royalty-free songs across genres for testing
  - 5 English pop/rock
  - 5 Bollywood/Hindi film
  - 3 Odia/regional Indian
  - 3 Classical Western
  - 3 EDM/electronic
  - 3 Instrumental (no vocals)
  - 2 Stitched multi-song files (15-30 min each)
- [ ] Run each through the pipeline and manually evaluate choreography quality
- [ ] Grade each output A/B/C/D and note specific issues

---

## 3. Post-build verification checklist

### 3.1 After Phase 1 (Audio Analysis)

- [ ] Run `pop_english_30s.wav` — verify beat count matches a manual count (±5%)
- [ ] Run `bollywood_30s.wav` — verify it completes without crash
- [ ] Run `silence_gaps.wav` — verify song boundary detection finds the gap
- [ ] Run a 10-minute file — verify processing completes in < 4 minutes
- [ ] Check all 6 frequency bands have non-zero data
- [ ] Check sections list has at least 2 sections for a 3-min song

### 3.2 After Phase 2 (Choreography Engine)

- [ ] Generate a show for the Maker Associates 100x30ft config
- [ ] Verify no valve cycles faster than 100ms
- [ ] Verify VFD values stay within 0-255
- [ ] Verify symmetry rule: if peacock_tail_left fires, peacock_tail_right also fires
- [ ] Verify silence handling: when RMS < 10% of mean for > 1s, effects reduce
- [ ] Verify the chorus section has higher average intensity than the verse

### 3.3 After Phase 3a (Code Generation)

- [ ] Arduino .ino compiles with `arduino-cli compile --fqbn arduino:avr:mega`
- [ ] Generated pin assignments don't exceed Mega's pin count
- [ ] SD card binary file is correctly formatted (verify with hex dump)
- [ ] JSON timeline validates against the schema
- [ ] CSV opens correctly in Excel/Google Sheets

### 3.4 After Phase 3b (3D Simulation)

- [ ] Particles visible and move upward (not sideways or downward)
- [ ] Audio playback syncs with particle behavior (tap test: hit play, watch beat response)
- [ ] RGB colors change with the music
- [ ] Frame rate stays above 30fps on a modern laptop
- [ ] Bloom effect visible on particles near RGB lights
- [ ] Camera orbit controls work (drag to rotate, scroll to zoom)

### 3.5 After Phase 4 (SaaS Platform)

- [ ] Sign up flow works (Clerk)
- [ ] File upload works (drag and drop MP3, verify it reaches S3/MinIO)
- [ ] Processing job starts and progress bar updates
- [ ] Results page shows 3D simulation + download buttons
- [ ] Download buttons produce valid files
- [ ] Multiple users can have separate projects (multi-tenancy)

---

## 4. Deployment checklist (when ready to launch)

### 4.1 Infrastructure

- [ ] Set up production PostgreSQL (RDS, Neon, Supabase, or Railway)
- [ ] Set up production Redis (ElastiCache, Upstash, or Railway)
- [ ] Set up production S3 bucket with CORS policy
- [ ] Deploy frontend to Vercel
- [ ] Deploy API to Railway or Fly.io
- [ ] Deploy Python worker to Cloud Run or Fly.io (4 GB memory)
- [ ] Set up CloudFront CDN for static assets and simulation data
- [ ] Configure custom domain + SSL

### 4.2 Monitoring

- [ ] Set up error tracking (Sentry) for frontend + API + worker
- [ ] Set up uptime monitoring (Better Uptime, Checkly)
- [ ] Set up log aggregation (Axiom, Datadog, or CloudWatch)
- [ ] Set up job queue monitoring (BullMQ dashboard or custom)
- [ ] Create alerts for: failed jobs > 5%, processing time > 20 min, disk usage > 80%

### 4.3 Security

- [ ] Enable Clerk production mode
- [ ] Set S3 bucket to private (no public access)
- [ ] Rate limit API endpoints (10 requests/minute for upload, 100/minute for reads)
- [ ] Add Content-Security-Policy headers
- [ ] Audit all environment variables — no secrets in code
- [ ] Add file type validation (only accept audio MIME types)
- [ ] Scan uploaded files for malware (ClamAV or similar)

### 4.4 Legal

- [ ] Terms of Service (cover: uploaded content ownership, data retention, liability)
- [ ] Privacy Policy (GDPR-compliant if serving EU users)
- [ ] Cookie consent (if using analytics)
- [ ] Audio file retention policy (auto-delete after 30 days)

---

## 5. Nice-to-have features (post-launch backlog)

Priority-ordered list of features to consider after initial launch:

1. **Timeline editor** — drag keyframes, adjust timing, visual waveform display
2. **Pattern marketplace** — users share choreography templates
3. **AI choreography mode** — Claude API generates creative themes beyond rule-based
4. **Multi-song playlist** — upload a setlist, get transitions between songs
5. **Export video** — render the 3D simulation as MP4 for client presentations
6. **Mobile-optimized viewer** — simplified 2D visualization for phones
7. **Real-time preview** — stream audio to Python worker, get choreography in near-real-time
8. **Custom nozzle definitions** — user describes a nozzle type the system doesn't know
9. **Community library** — browse and fork shows created by other users (with permission)
10. **Hardware store integration** — recommend specific pumps/valves/LEDs from supplier catalogs

---

## 6. Questions for future research

- Can we use Spotify/YouTube audio features API to skip our own analysis for known songs?
- Is there a market for a hardware kit (Arduino + relay board + valves) sold alongside the software?
- Should we partner with fountain manufacturers (Maker Associates, Symphony) for distribution?
- Can we offer a "fountain design" service — user gives us the space dimensions, we suggest a layout?
- Would a mobile app that controls the fountain live (manual mode) complement the automated shows?
