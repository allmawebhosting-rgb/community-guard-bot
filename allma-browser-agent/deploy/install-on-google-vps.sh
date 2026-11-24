#!/usr/bin/env bash
# Install Allma browser booking agent on a Google Compute Engine VM (Ubuntu).
# Run ON the VPS (GCP Console → SSH, or your own ssh session):
#   curl -fsSL https://raw.githubusercontent.com/allmawebhosting-rgb/community-guard-bot/main/allma-browser-agent/deploy/install-on-google-vps.sh | sudo bash
# Or from a cloned repo:
#   sudo bash allma-browser-agent/deploy/install-on-google-vps.sh
set -euo pipefail

REPO_URL="${ALLMA_REPO_URL:-https://github.com/allmawebhosting-rgb/community-guard-bot.git}"
BRANCH="${ALLMA_BRANCH:-main}"
INSTALL_DIR="/opt/allma-browser-agent"
SERVICE_USER="${SUDO_USER:-ubuntu}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  git curl ca-certificates rsync openssl python3 python3-venv python3-pip \
  xvfb \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libxkbcommon0 libgtk-3-0
# Ubuntu 24.04 renamed libasound2 → libasound2t64; keep both attempts.
apt-get install -y libasound2t64 2>/dev/null || apt-get install -y libasound2 2>/dev/null || true

echo "==> Fetching agent source"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP/repo"
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
  --exclude '.env' \
  --exclude 'venv' \
  --exclude 'vault_store.enc' \
  --exclude 'storage/screenshots/*.png' \
  --exclude '__pycache__' \
  "$TMP/repo/allma-browser-agent/" "$INSTALL_DIR/"

echo "==> Python venv + Playwright"
cd "$INSTALL_DIR"
python3 -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
playwright install --with-deps chromium

echo "==> Secrets / .env"
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  TOKEN="$(openssl rand -hex 32)"
  VAULT_KEY="$(python3 - <<'PY'
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
PY
)"
  cat > "$INSTALL_DIR/.env" <<EOF
# Cloudflare Workers AI via Allma proxy (preferred after Allma redeploy)
BROWSER_AGENT_LLM_BASE_URL=https://allmasafetyai.online/api/browser-llm/v1
BROWSER_AGENT_LLM_API_KEY=${TOKEN}
BROWSER_AGENT_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
BROWSER_AGENT_USE_VISION=false

# Fallback until the proxy is live — fill these from Cloudflare dashboard:
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_workers_ai_api_token

VPS_AGENT_SECRET_TOKEN=${TOKEN}
VAULT_SECRET_KEY=${VAULT_KEY}
VAULT_DB_PATH=/opt/allma-browser-agent/vault_store.enc
SCREENSHOT_DIR=/opt/allma-browser-agent/storage/screenshots
CORS_ALLOW_ORIGINS=*
EOF
  chmod 600 "$INSTALL_DIR/.env"
  echo "Created $INSTALL_DIR/.env (token generated)."
else
  echo "Keeping existing $INSTALL_DIR/.env"
  TOKEN="$(grep -E '^VPS_AGENT_SECRET_TOKEN=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
fi

mkdir -p "$INSTALL_DIR/storage/screenshots"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# Ensure systemd unit uses the right user
sed -i "s/^User=.*/User=${SERVICE_USER}/" "$INSTALL_DIR/deploy/allma-agent.service"
sed -i "s/^Group=.*/Group=${SERVICE_USER}/" "$INSTALL_DIR/deploy/allma-agent.service"

echo "==> systemd"
cp "$INSTALL_DIR/deploy/allma-agent.service" /etc/systemd/system/allma-agent.service
systemctl daemon-reload
systemctl enable --now allma-agent
sleep 2
systemctl --no-pager --full status allma-agent || true

# Best-effort public IP (GCP metadata, then ifconfig.me)
PUBLIC_IP="$(curl -fsS -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
fi

echo
echo "=============================================="
echo " Allma browser agent is installed."
echo " Health:  curl http://127.0.0.1:8000/health"
echo
echo " GCP firewall: allow TCP 8000 from the internet"
echo "   (VPC network → Firewall → Create rule, tcp:8000)"
echo
echo " Add these in Cursor secure secrets for Allma chat:"
echo "   VPS_AGENT_BASE_URL=http://${PUBLIC_IP}:8000"
echo "   VPS_AGENT_SECRET_TOKEN=${TOKEN}"
echo
echo " LLM: edit $INSTALL_DIR/.env"
echo "   Prefer CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN"
echo "   (or wait for /api/browser-llm proxy after Allma redeploy)"
echo "=============================================="
