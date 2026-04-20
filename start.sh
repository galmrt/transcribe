#!/bin/bash
set -e

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # no colour

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if [ ! -f "$ROOT/venv/bin/activate" ]; then
  echo -e "${RED}Error:${NC} venv not found. Run: python3 -m venv venv && source venv/bin/activate && pip install -r backend/requirements.txt"
  exit 1
fi

if [ ! -f "$ROOT/backend/.env" ]; then
  echo -e "${RED}Error:${NC} backend/.env not found. Copy backend/.env.example and fill in your keys."
  exit 1
fi

if [ ! -f "$ROOT/frontend/.env" ]; then
  echo -e "${RED}Error:${NC} frontend/.env not found. Copy frontend/.env.example and fill in your keys."
  exit 1
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo -e "${YELLOW}node_modules not found — running npm install...${NC}"
  cd "$ROOT/frontend" && npm install
fi

# ── Cleanup on exit ───────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup SIGINT SIGTERM

# ── Start backend ─────────────────────────────────────────────────────────────
echo -e "${BLUE}Starting backend...${NC}"
source "$ROOT/venv/bin/activate"
cd "$ROOT/backend"
uvicorn app:app --reload --port 8000 2>&1 | sed "s/^/$(echo -e "${BLUE}[backend]${NC}") /" &
BACKEND_PID=$!

# ── Start frontend ────────────────────────────────────────────────────────────
echo -e "${GREEN}Starting frontend...${NC}"
cd "$ROOT/frontend"
npm run dev 2>&1 | sed "s/^/$(echo -e "${GREEN}[frontend]${NC}") /" &
FRONTEND_PID=$!

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}Services running:${NC}"
echo -e "  Frontend  →  http://localhost:5173"
echo -e "  Backend   →  http://localhost:8000"
echo -e "  API docs  →  http://localhost:8000/docs"
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop."
echo ""

wait
