# Allma Browser Agent

Autonomous VPS service that books hospital appointments via Google search, saved vault credentials, form fill, and confirmation screenshots.

## LLM — Cloudflare Workers AI works (OpenAI optional)

You do **not** need an OpenAI key. Prefer Cloudflare Workers AI.

### Option A (recommended): Allma Workers AI proxy

Uses the same Workers AI binding that powers Allma chat.

```bash
BROWSER_AGENT_LLM_BASE_URL=https://allmasafetyai.online/api/browser-llm/v1
BROWSER_AGENT_LLM_API_KEY=<same value as VPS_AGENT_SECRET_TOKEN>
BROWSER_AGENT_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
BROWSER_AGENT_USE_VISION=false
```

Also set `VPS_AGENT_SECRET_TOKEN` on the **Cloudflare Worker** (Allma app) to that same token so the proxy accepts the agent.

### Option B: Cloudflare Workers AI REST API

```bash
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...   # dash.cloudflare.com → API Tokens → Workers AI Edit
BROWSER_AGENT_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
BROWSER_AGENT_USE_VISION=false
```

### Option C: OpenAI

```bash
OPENAI_API_KEY=sk-...
BROWSER_AGENT_MODEL=gpt-4o
BROWSER_AGENT_USE_VISION=true
```

## Setup on Google Cloud VPS (recommended)

From the GCP Console → your VM → **SSH** (browser SSH is fine), run:

```bash
curl -fsSL https://raw.githubusercontent.com/allmawebhosting-rgb/community-guard-bot/main/allma-browser-agent/deploy/install-on-google-vps.sh | sudo bash
```

Then:
1. **Firewall** — allow TCP **8000** inbound on the VPC (GCP → VPC network → Firewall).
2. Put `VPS_AGENT_BASE_URL` and `VPS_AGENT_SECRET_TOKEN` on the Allma Cloudflare Worker (`wrangler secret put`).
   - **Do not use a raw IP** — Cloudflare Workers return error 1003 on direct IP fetches.
   - Prefer a DNS-only hostname (e.g. `http://agent.allmasafetyai.online:8000`) or `http://<ip>.nip.io:8000`.
   - Booking is **async**: the Worker starts a job and polls `/api/tasks/book-appointment/{job_id}`.
3. Edit `/opt/allma-browser-agent/.env` — set `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (Workers AI) so booking can run without OpenAI.
4. Ensure Playwright Chromium is installed for the `ubuntu` service user (`playwright install --with-deps chromium`).

## Manual setup

```bash
sudo apt update && sudo apt install -y python3-pip python3-venv xvfb \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1 libasound2

cd /opt/allma-browser-agent
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install --with-deps chromium

cp .env.example .env
# Edit .env — Cloudflare LLM vars + rotate VPS_AGENT_SECRET_TOKEN / VAULT_SECRET_KEY
sudo cp deploy/allma-agent.service /etc/systemd/system/allma-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now allma-agent
```

## Safety

- Never enters credit/debit card details; halts and reports `payment_required`.
- Never logs passwords or returns them to chat.
- Uganda emergency numbers for failed/urgent cases: Police 999, Toll-free 112, Ambulance 911 (medical).
