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

## Setup

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
