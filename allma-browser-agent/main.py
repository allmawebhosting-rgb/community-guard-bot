"""Allma browser agent API — vault + autonomous appointment booking."""

from __future__ import annotations

import asyncio
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
    portal_url: str | None = Field(
        default=None,
        description="Official clinic website / booking page — never a search engine",
    )
    clinic_phone: str | None = Field(
        default=None,
        description="Clinic phone for voice booking fallback when online booking fails",
    )


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


# In-memory booking jobs so Cloudflare Workers can start a task and poll
# without holding a single HTTP request open for the full Playwright run.
_BOOKING_JOBS: dict[str, dict[str, Any]] = {}
ASK_USER_TIMEOUT_S = int(os.getenv("BOOKING_ASK_USER_TIMEOUT_S", "600") or "600")


async def _run_booking_job(job_id: str, body: BookAppointmentIn) -> None:
    _BOOKING_JOBS[job_id]["status"] = "running"
    _BOOKING_JOBS[job_id]["summary"] = "Browser agent is running…"
    _BOOKING_JOBS[job_id]["steps"] = []
    _BOOKING_JOBS[job_id]["screenshots"] = []

    def on_progress(update: dict[str, Any]) -> None:
        job = _BOOKING_JOBS.get(job_id)
        if not job or job.get("status") not in {"queued", "running"}:
            return
        job["status"] = "running"
        job["summary"] = str(update.get("summary") or job.get("summary") or "Booking in progress…")
        job["steps"] = list(update.get("steps") or [])
        job["screenshots"] = list(update.get("screenshots") or [])
        shot = update.get("screenshot_url")
        if isinstance(shot, str) and shot:
            job["screenshot_url"] = shot

    async def ask_user(question: str) -> str:
        job = _BOOKING_JOBS.get(job_id)
        if job is None:
            return "No answer available. Do not guess; stop and report what is missing."
        future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        job["question"] = question
        job["answer_future"] = future
        job["status"] = "needs_input"
        try:
            return await asyncio.wait_for(future, timeout=ASK_USER_TIMEOUT_S)
        except asyncio.TimeoutError:
            return (
                "The patient did not answer in time. Do not guess the value; stop and "
                "report that the booking needs this detail."
            )
        finally:
            job.pop("answer_future", None)
            job.pop("question", None)
            if job.get("status") == "needs_input":
                job["status"] = "running"

    try:
        result = await run_booking_task(
            hospital_name=body.hospital_name,
            patient_name=body.patient_name or "Patient",
            phone_number=body.phone_number or "",
            preferred_time=body.preferred_time,
            reason_for_visit=body.reason_for_visit,
            portal_url=body.portal_url or "",
            clinic_phone=body.clinic_phone or "",
            on_progress=on_progress,
            ask_user=ask_user,
        )
        _BOOKING_JOBS[job_id] = {
            "status": "completed" if result.get("success") else str(result.get("status") or "failed"),
            "result": result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("booking job %s failed", job_id)
        _BOOKING_JOBS[job_id] = {
            "status": "failed",
            "result": {
                "status": "failed",
                "hospital": body.hospital_name,
                "summary": f"Booking agent crashed: {exc}",
                "screenshot_url": None,
                "screenshots": [],
                "steps": _BOOKING_JOBS.get(job_id, {}).get("steps") or [],
                "success": False,
                "payment_required": False,
            },
        }


@app.post("/api/tasks/book-appointment", dependencies=[Depends(require_bearer)])
async def book_appointment(body: BookAppointmentIn) -> dict[str, Any]:
    """Start a booking job and return immediately with a job id.

    Cloudflare Workers must poll GET /api/tasks/book-appointment/{job_id}
    so Playwright can run longer than a single Worker/proxy timeout.
    """
    logger.info(
        "book_appointment hospital=%r preferred_time=%r",
        body.hospital_name,
        body.preferred_time,
    )
    job_id = secrets.token_hex(8)
    _BOOKING_JOBS[job_id] = {
        "status": "queued",
        "hospital": body.hospital_name,
        "preferred_time": body.preferred_time,
    }
    asyncio.create_task(_run_booking_job(job_id, body))
    return {
        "ok": True,
        "async": True,
        "job_id": job_id,
        "status": "queued",
        "hospital": body.hospital_name,
        "summary": "Booking started. Poll /api/tasks/book-appointment/{job_id} for the result.",
        "success": False,
        "payment_required": False,
    }


@app.get("/api/tasks/book-appointment/{job_id}", dependencies=[Depends(require_bearer)])
async def book_appointment_status(job_id: str) -> dict[str, Any]:
    job = _BOOKING_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown job_id")
    if job.get("status") == "needs_input":
        question = str(job.get("question") or "I need one more detail to finish the form.")
        return {
            "ok": True,
            "async": True,
            "job_id": job_id,
            "status": "needs_input",
            "hospital": job.get("hospital"),
            "preferred_time": job.get("preferred_time"),
            "question": question,
            "summary": question,
            "steps": job.get("steps") or [],
            "screenshots": job.get("screenshots") or [],
            "screenshot_url": job.get("screenshot_url"),
            "success": False,
            "payment_required": False,
        }
    if job.get("status") in {"queued", "running"}:
        return {
            "ok": True,
            "async": True,
            "job_id": job_id,
            "status": job["status"],
            "hospital": job.get("hospital"),
            "preferred_time": job.get("preferred_time"),
            "summary": job.get("summary") or f"Booking still {job['status']}.",
            "steps": job.get("steps") or [],
            "screenshots": job.get("screenshots") or [],
            "screenshot_url": job.get("screenshot_url"),
            "success": False,
            "payment_required": False,
        }
    result = job.get("result") or {}
    return {"ok": True, "async": True, "job_id": job_id, **result}


class BookingAnswerIn(BaseModel):
    answer: str = Field(..., min_length=1, max_length=500)


@app.post("/api/tasks/book-appointment/{job_id}/answer", dependencies=[Depends(require_bearer)])
async def book_appointment_answer(job_id: str, body: BookingAnswerIn) -> dict[str, Any]:
    """Give the paused booking agent the patient's answer so it keeps filling the form."""
    job = _BOOKING_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown job_id")
    future = job.get("answer_future")
    if job.get("status") != "needs_input" or future is None or future.done():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking is not waiting for an answer")
    future.set_result(body.answer.strip())
    job["status"] = "running"
    return {"ok": True, "job_id": job_id, "status": "running"}
