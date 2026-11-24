# Allma Browser Agent

Autonomous VPS service that books hospital appointments via Google search, saved vault credentials, form fill, and confirmation screenshots.

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

# Edit .env — set OPENAI_API_KEY, rotate VPS_AGENT_SECRET_TOKEN / VAULT_SECRET_KEY
sudo cp deploy/allma-agent.service /etc/systemd/system/allma-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now allma-agent
```

## Safety

- Never enters credit/debit card details; halts and reports `payment_required`.
- Never logs passwords or returns them to chat.
- Uganda emergency numbers for failed/urgent cases: Police 999, Toll-free 112, Ambulance 911 (medical).

## Web app env (Allma / TanStack)

```bash
VPS_AGENT_BASE_URL="https://your-vps-ip:8000"
VPS_AGENT_SECRET_TOKEN="same_token_as_VPS_AGENT_SECRET_TOKEN"
```

When configured, Allma’s `book_hospital_appointment` chat tool dispatches bookings to this service.
