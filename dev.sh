#!/usr/bin/env bash
# =============================================================================
# dev.sh — KMITL AI Frontend Dev Launcher
#
# ใช้งาน:
#   ./dev.sh          → รันที่ port 3000 (default)
#   ./dev.sh --port 3500  → บังคับใช้ port 3500
#   ./dev.sh --auto   → ตรวจสอบ port 3000 อัตโนมัติ ถ้าไม่ว่างย้ายไป 3500
# =============================================================================

set -euo pipefail

# ────────────────────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────────────────────
FRONTEND_DIR="$(cd "$(dirname "$0")/open-notebook/frontend" && pwd)"
ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"
DEFAULT_PORT=3000
FALLBACK_PORT=3500
CHOSEN_PORT=$DEFAULT_PORT
MODE="default"   # default | auto | manual

# ────────────────────────────────────────────────────────────────────────────
# Color helpers
# ────────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ${RESET}  $*"; }
success() { echo -e "${GREEN}✔${RESET}  $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✖${RESET}  $*" >&2; }
banner()  { echo -e "\n${BOLD}${CYAN}$*${RESET}\n"; }

# ────────────────────────────────────────────────────────────────────────────
# Parse arguments
# ────────────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto|-a)
      MODE="auto"
      shift ;;
    --port|-p)
      MODE="manual"
      CHOSEN_PORT="${2:?--port requires a number}"
      shift 2 ;;
    --help|-h)
      echo ""
      echo "  ${BOLD}dev.sh${RESET} — KMITL AI Frontend Dev Launcher"
      echo ""
      echo "  ${BOLD}Usage:${RESET}"
      echo "    ./dev.sh              ใช้ port 3000 (default)"
      echo "    ./dev.sh --auto       ตรวจสอบอัตโนมัติ 3000 → 3500"
      echo "    ./dev.sh --port 3500  บังคับใช้ port ที่ระบุ"
      echo ""
      exit 0 ;;
    *)
      error "Unknown option: $1  (ลอง ./dev.sh --help)"
      exit 1 ;;
  esac
done

# ────────────────────────────────────────────────────────────────────────────
# Check if a port is busy
# ────────────────────────────────────────────────────────────────────────────
port_in_use() {
  local port=$1
  # lsof -i covers macOS + Linux; fallback to nc
  if command -v lsof &>/dev/null; then
    lsof -i "TCP:${port}" -sTCP:LISTEN -t &>/dev/null
  else
    nc -z 127.0.0.1 "$port" &>/dev/null
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# Decide which port to use
# ────────────────────────────────────────────────────────────────────────────
banner "🚀 KMITL AI — Dev Launcher"

case "$MODE" in
  auto|default)
    info "ตรวจสอบ port ${DEFAULT_PORT}..."
    if port_in_use "$DEFAULT_PORT"; then
      warn "Port ${DEFAULT_PORT} ถูกใช้งานอยู่แล้ว"
      info "ย้ายไป port ${FALLBACK_PORT} อัตโนมัติ"
      CHOSEN_PORT=$FALLBACK_PORT
    else
      success "Port ${DEFAULT_PORT} ว่าง — ใช้ port ${DEFAULT_PORT}"
      CHOSEN_PORT=$DEFAULT_PORT
    fi ;;
  manual)
    if port_in_use "$CHOSEN_PORT"; then
      warn "Port ${CHOSEN_PORT} ถูกใช้งานอยู่ แต่คุณบังคับใช้ port นี้ (--port)"
    fi ;;
esac

# ────────────────────────────────────────────────────────────────────────────
# Patch .env: FRONTEND_URL + CORS_ORIGINS
# ────────────────────────────────────────────────────────────────────────────
patch_env() {
  local port=$1
  local other_port

  if [[ "$port" == "$DEFAULT_PORT" ]]; then
    other_port=$FALLBACK_PORT
  else
    other_port=$DEFAULT_PORT
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    warn ".env ไม่พบที่ $ENV_FILE — ข้ามการแก้ไข"
    return
  fi

  # FRONTEND_URL
  sed -i.bak \
    "s|FRONTEND_URL=http://localhost:${other_port}|FRONTEND_URL=http://localhost:${port}|g" \
    "$ENV_FILE"

  # CORS_ORIGINS — ให้ทั้งสอง port อยู่เสมอ แต่ port ที่ใช้งานอยู่ข้างหน้า
  local cors_line="CORS_ORIGINS=http://localhost:${port},http://localhost:${other_port},http://localhost:3001,http://localhost:3002,http://localhost"
  sed -i.bak \
    "s|^CORS_ORIGINS=.*|${cors_line}|g" \
    "$ENV_FILE"

  rm -f "${ENV_FILE}.bak"
  success ".env อัปเดตแล้ว — FRONTEND_URL=http://localhost:${port}"
}

# ────────────────────────────────────────────────────────────────────────────
# Update package.json dev script port
# ────────────────────────────────────────────────────────────────────────────
patch_package_json() {
  local port=$1
  local pkg="${FRONTEND_DIR}/package.json"

  if [[ ! -f "$pkg" ]]; then
    warn "package.json ไม่พบ — ข้าม"
    return
  fi

  # Replace any -p <number> or add it
  if grep -q '"dev":' "$pkg"; then
    sed -i.bak \
      "s|\"next dev.*\"|\"next dev -p ${port}\"|g" \
      "$pkg"
    rm -f "${pkg}.bak"
    success "package.json → next dev -p ${port}"
  fi
}

info "ใช้งาน port: ${BOLD}${CHOSEN_PORT}${RESET}"
patch_env "$CHOSEN_PORT"
patch_package_json "$CHOSEN_PORT"

# ────────────────────────────────────────────────────────────────────────────
# Show summary
# ────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}Frontend${RESET}  →  ${GREEN}http://localhost:${CHOSEN_PORT}${RESET}"
echo -e "  ${BOLD}API${RESET}       →  http://localhost:5055"
echo ""

# ────────────────────────────────────────────────────────────────────────────
# Start Next.js dev server
# ────────────────────────────────────────────────────────────────────────────
info "กำลังเริ่ม Next.js dev server..."
cd "$FRONTEND_DIR"
exec npm run dev
