"""Allma browser agent API — vault + autonomous appointment booking."""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv("/opt/allma-browser-agent/.env")

from agent.browser_runner import run_booking_task  # noqa: E402
from agent.vault import CredentialVault  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("allma.agent")

SCREENSHOT_DIR = Path(
    os.getenv("SCREENSHOT_DIR") or "/opt/allma-browser-agent/storage/screenshots"
)
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Allma Browser Agent", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/screenshots", StaticFiles(directory=str(SCREENSHOT_DIR)), name="screenshots")


def require_bearer(authorization: str | None = Header(default=None)) -> None:
    expected = (os.getenv("VPS_AGENT_SECRET_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VPS_AGENT_SECRET_TOKEN is not configured",
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token")


class VaultCredentialIn(BaseModel):
    domain_key: str = Field(..., min_length=1, description="Hospital name or portal domain")
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    notes: str | None = None


class BookAppointmentIn(BaseModel):
    hospital_name: str = Field(..., min_length=1)
    patient_name: str | None = None
    phone_number: str | None = None
    preferred_time: str = Field(..., min_length=1)
    reason_for_visit: str = Field(..., min_length=1)


def _llm_provider_status() -> str:
    """Report which LLM path is configured (never returns secret values)."""
    proxy = (os.getenv("BROWSER_AGENT_LLM_BASE_URL") or "").strip()
    proxy_key = (
        os.getenv("BROWSER_AGENT_LLM_API_KEY")
        or os.getenv("VPS_AGENT_SECRET_TOKEN")
        or ""
    ).strip()
    cf_account = (os.getenv("CLOUDFLARE_ACCOUNT_ID") or "").strip()
    cf_token = (
        os.getenv("CLOUDFLARE_API_TOKEN") or os.getenv("CLOUDFLARE_API_KEY") or ""
    ).strip()
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()

    def _placeholder(v: str) -> bool:
        if not v:
            return True
        lower = v.lower()
        return "your_" in lower or lower.endswith("_here") or lower in {
            "changeme",
            "replace_me",
            "xxx",
            "todo",
        }

    model = (
        os.getenv("BROWSER_AGENT_MODEL")
        or os.getenv("CLOUDFLARE_BROWSER_MODEL")
        or "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    )
    if proxy and not _placeholder(proxy_key):
        return f"allma-workers-ai-proxy:{model}"
    if cf_account and not _placeholder(cf_token):
        return f"cloudflare-workers-ai:{model}"
    if not _placeholder(openai_key):
        model = os.getenv("BROWSER_AGENT_MODEL") or "gpt-4o"
        return f"openai:{model}"
    return "none"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "online", "llm": _llm_provider_status()}


@app.post("/api/vault/credentials", dependencies=[Depends(require_bearer)])
async def save_credentials(body: VaultCredentialIn) -> dict[str, Any]:
    vault = CredentialVault()
    # Never log password.
    logger.info("vault_save domain_key=%r username=%r", body.domain_key, body.username)
    result = vault.set_credentials(
        domain_key=body.domain_key,
        username=body.username,
        password=body.password,
        notes=body.notes,
    )
    return {"ok": True, **result}


@app.get("/api/vault/domains", dependencies=[Depends(require_bearer)])
async def list_domains() -> dict[str, Any]:
    vault = CredentialVault()
    return {"ok": True, "domains": vault.list_domains()}


@app.post("/api/tasks/book-appointment", dependencies=[Depends(require_bearer)])
async def book_appointment(body: BookAppointmentIn) -> dict[str, Any]:
    logger.info(
        "book_appointment hospital=%r preferred_time=%r",
        body.hospital_name,
        body.preferred_time,
    )
    result = await run_booking_task(
        hospital_name=body.hospital_name,
        patient_name=body.patient_name or "Patient",
        phone_number=body.phone_number or "",
        preferred_time=body.preferred_time,
        reason_for_visit=body.reason_for_visit,
    )
    return result
