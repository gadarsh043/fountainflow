#!/usr/bin/env bash
# FountainFlow — single-command startup script
# Usage: npm run fountainflow
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS_FILE="$ROOT/.pids"

# ── Colors ────────────────────────────────────────────────────────────────────
BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${BLUE}[FountainFlow]${NC} $1"; }
ok()   { echo -e "${GREEN}[FountainFlow]${NC} ✓ $1"; }
warn() { echo -e "${YELLOW}[FountainFlow]${NC} ! $1"; }
err()  { echo -e "${RED}[FountainFlow]${NC} ✗ $1"; }

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log "Shutting down all services..."
  if [ -f "$PIDS_FILE" ]; then
    while IFS= read -r pid; do
      kill "$pid" 2>/dev/null && echo "  Killed PID $pid" || true
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
  ok "All services stopped. Goodbye."
}
trap cleanup INT TERM EXIT

# ── Prerequisite checks ───────────────────────────────────────────────────────
log "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  err "Docker not found. Install Docker Desktop: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node.js 20+: https://nodejs.org"
  exit 1
fi

WORKER_VENV="$ROOT/apps/worker/venv"
if [ ! -f "$WORKER_VENV/bin/uvicorn" ]; then
  err "Python venv not set up. Run:"
  echo "  cd apps/worker && python3.11 -m venv venv && source venv/bin/activate"
  echo "  pip install Cython 'numpy==1.26.4'"
  echo "  pip install madmom==0.16.1 --no-build-isolation"
  echo "  pip install -r requirements.txt"
  exit 1
fi

if [ ! -f "$ROOT/.env" ]; then
  err ".env file not found. Run: cp .env.example .env  (then fill in Clerk keys)"
  exit 1
fi

# Check Clerk keys are actually set
if grep -qE "^CLERK_SECRET_KEY=sk_test_xxx" "$ROOT/.env" 2>/dev/null; then
  warn "CLERK_SECRET_KEY looks like a placeholder — set real keys in .env"
fi

ok "Prerequisites OK"
rm -f "$PIDS_FILE"
mkdir -p "$ROOT/logs"

# ── 1. Infrastructure (Docker) ────────────────────────────────────────────────
log "Starting infrastructure (PostgreSQL, Redis, MinIO)..."
cd "$ROOT" && docker-compose up -d 2>&1 | grep -E "Starting|Started|Running|healthy|done|up-to-date" || true
sleep 2
ok "Docker infrastructure up"

# ── 2. Env symlinks ───────────────────────────────────────────────────────────
[ -L "$ROOT/apps/api/.env" ]       || ln -sf "$ROOT/.env" "$ROOT/apps/api/.env"
[ -L "$ROOT/apps/web/.env.local" ] || ln -sf "$ROOT/.env" "$ROOT/apps/web/.env.local"

# ── 3. Database migrations ────────────────────────────────────────────────────
log "Running database migrations..."
cd "$ROOT/apps/api" && node_modules/.bin/prisma migrate deploy 2>&1 | grep -v "Update available" | tail -3
ok "Database ready"

# ── 4. NestJS API (background) ───────────────────────────────────────────────
log "Starting NestJS API on http://localhost:3001 ..."
cd "$ROOT/apps/api"
node node_modules/@nestjs/cli/bin/nest.js start >"$ROOT/logs/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" >> "$PIDS_FILE"

# Wait up to 20 s for API to be ready
for i in $(seq 1 20); do
  sleep 1
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    ok "NestJS API ready (PID $API_PID)"
    break
  fi
  if [ "$i" -eq 20 ]; then
    err "API did not start in time — check logs/api.log"
    exit 1
  fi
done

# ── 5. Python FastAPI worker (background) ────────────────────────────────────
log "Starting Python worker on http://localhost:8001 ..."
cd "$ROOT/apps/worker"
"$WORKER_VENV/bin/uvicorn" main:app --host 0.0.0.0 --port 8001 \
  >"$ROOT/logs/worker.log" 2>&1 &
WORKER_PID=$!
echo "$WORKER_PID" >> "$PIDS_FILE"
sleep 2
ok "Python worker ready (PID $WORKER_PID)"

# ── 6. Celery worker (background) ────────────────────────────────────────────
log "Starting Celery worker..."
cd "$ROOT/apps/worker"
"$WORKER_VENV/bin/celery" -A worker worker --loglevel=warning \
  >"$ROOT/logs/celery.log" 2>&1 &
CELERY_PID=$!
echo "$CELERY_PID" >> "$PIDS_FILE"
sleep 1
ok "Celery worker ready (PID $CELERY_PID)"

# ── 7. Next.js frontend (foreground) ─────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  FountainFlow is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Web app  →  ${BLUE}http://localhost:3002${NC}"
echo -e "  API      →  ${BLUE}http://localhost:3001${NC}"
echo -e "  Worker   →  ${BLUE}http://localhost:8001${NC}"
echo -e "  MinIO    →  ${BLUE}http://localhost:9001${NC}  (admin / minioadmin)"
echo ""
echo -e "  Logs: logs/api.log · logs/worker.log · logs/celery.log"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop everything."
echo ""

cd "$ROOT/apps/web"
node node_modules/next/dist/bin/next dev --port 3002
