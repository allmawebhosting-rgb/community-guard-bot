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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "online"}


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
