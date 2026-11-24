"""Autonomous hospital appointment booking via browser-use + Playwright."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any

from agent.vault import CredentialVault

logger = logging.getLogger("allma.browser_runner")

SCREENSHOT_DIR = Path(
    os.getenv("SCREENSHOT_DIR") or "/opt/allma-browser-agent/storage/screenshots"
)
PAYMENT_HALT = re.compile(
    r"\b(credit\s*card|debit\s*card|cvv|cvc|card\s*number|payment\s*required|enter\s*payment)\b",
    re.I,
)


def _safe_summary(text: str, limit: int = 1200) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    # Redact anything that looks like a password assignment if the agent echoes UI labels poorly.
    cleaned = re.sub(r"(?i)(password|passwd|pwd)\s*[:=]\s*\S+", r"\1: [redacted]", cleaned)
    if len(cleaned) > limit:
        return cleaned[: limit - 1] + "…"
    return cleaned


def _build_task_prompt(
    *,
    hospital_name: str,
    patient_name: str,
    phone_number: str,
    preferred_time: str,
    reason_for_visit: str,
    has_credentials: bool,
) -> str:
    login_block = (
        "If the portal requires login and credentials were provided via sensitive_data placeholders "
        "(x_username / x_password), enter those saved credentials. Never invent credentials. "
        "Never print or speak the password."
        if has_credentials
        else "If the portal requires login and no saved credentials exist, stop and report that "
        "login is required so a human can save credentials in the vault."
    )
    return f"""
You are booking a medical appointment for Allma Safety AI. Work carefully and stop if payment is required.

Goals:
1. Open https://www.google.com and search for "{hospital_name} online appointment booking".
2. Open the official hospital/clinic appointment portal from the results (prefer the official site).
3. {login_block}
4. Find and select an appointment slot matching "{preferred_time}" (or the closest available slot if exact match is unavailable — say what you picked).
5. Fill the booking form with:
   - Patient name: {patient_name}
   - Phone number: {phone_number}
   - Reason for visit / symptoms: {reason_for_visit}
6. Submit the booking and reach the confirmation / reference screen.
7. Extract any confirmation number, doctor/department, and date/time shown.

Hard rules:
- Do NOT enter credit card, debit card, CVV, or any payment details.
- If the site demands payment to continue, STOP immediately and report payment_required=true.
- Do not invent a booking confirmation. Only report what the page shows.
- Prefer Uganda-relevant portals when the hospital is in Uganda.
- Keep actions focused; finish when confirmation is visible or when blocked.
""".strip()


async def _capture_screenshot(page: Any, path: Path) -> bool:
    try:
        await page.screenshot(path=str(path), full_page=True)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("screenshot_failed err=%s", type(exc).__name__)
        return False


async def run_booking_task(
    hospital_name: str,
    patient_name: str,
    phone_number: str,
    preferred_time: str,
    reason_for_visit: str,
) -> dict[str, Any]:
    """Run the browser agent and return a structured booking result (no secrets)."""
    hospital_name = (hospital_name or "").strip()
    patient_name = (patient_name or "").strip() or "Patient"
    phone_number = (phone_number or "").strip() or "N/A"
    preferred_time = (preferred_time or "").strip() or "soonest available"
    reason_for_visit = (reason_for_visit or "").strip() or "Medical consultation"

    if not hospital_name:
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": "Hospital name is required.",
            "screenshot_url": None,
            "success": False,
            "payment_required": False,
        }

    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    shot_id = str(uuid.uuid4())
    shot_path = SCREENSHOT_DIR / f"{shot_id}.png"
    screenshot_url = f"/screenshots/{shot_id}.png"

    vault = CredentialVault()
    creds = vault.get_credentials(hospital_name)
    has_credentials = bool(creds)
    # Never log username/password values.
    logger.info(
        "booking_start hospital=%r has_credentials=%s",
        hospital_name,
        has_credentials,
    )

    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not openai_key:
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": "Browser agent is missing OPENAI_API_KEY on the VPS.",
            "screenshot_url": None,
            "success": False,
            "payment_required": False,
        }

    model_name = os.getenv("BROWSER_AGENT_MODEL", "gpt-4o").strip() or "gpt-4o"
    task = _build_task_prompt(
        hospital_name=hospital_name,
        patient_name=patient_name,
        phone_number=phone_number,
        preferred_time=preferred_time,
        reason_for_visit=reason_for_visit,
        has_credentials=has_credentials,
    )

    sensitive_data: dict[str, str] | None = None
    if creds:
        sensitive_data = {
            "x_username": creds["username"],
            "x_password": creds["password"],
        }

    try:
        from browser_use import Agent, Browser, BrowserConfig
        from langchain_openai import ChatOpenAI
    except ImportError as exc:
        logger.error("browser_use_import_failed err=%s", type(exc).__name__)
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": "Browser agent dependencies are not installed on the VPS.",
            "screenshot_url": None,
            "success": False,
            "payment_required": False,
        }

    browser = None
    try:
        browser_config = BrowserConfig(
            headless=True,
            extra_browser_args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        browser = Browser(config=browser_config)
        llm = ChatOpenAI(model=model_name, api_key=openai_key, temperature=0)

        agent_kwargs: dict[str, Any] = {
            "task": task,
            "llm": llm,
            "browser": browser,
            "use_vision": True,
            "max_actions_per_step": 6,
        }
        if sensitive_data:
            agent_kwargs["sensitive_data"] = sensitive_data

        agent = Agent(**agent_kwargs)
        history = await agent.run(max_steps=40)

        final_text = ""
        try:
            if hasattr(history, "final_result"):
                result = history.final_result()
                final_text = str(result or "")
            elif hasattr(history, "extracted_content"):
                chunks = history.extracted_content()
                if isinstance(chunks, list):
                    final_text = " ".join(str(c) for c in chunks if c)
                else:
                    final_text = str(chunks or "")
            else:
                final_text = str(history)
        except Exception:  # noqa: BLE001
            final_text = str(history)

        payment_required = bool(PAYMENT_HALT.search(final_text))
        if payment_required:
            summary = (
                "The portal asked for payment details. Booking was stopped before any card "
                "information was entered. Please complete payment yourself on the hospital site, "
                "or call Ambulance 911 / Toll-free 112 / Police 999 if this is urgent."
            )
            # Best-effort screenshot of the payment gate.
            try:
                context = getattr(browser, "context", None) or getattr(browser, "browser_context", None)
                pages = []
                if context is not None:
                    pages = getattr(context, "pages", []) or []
                if pages:
                    await _capture_screenshot(pages[-1], shot_path)
            except Exception:  # noqa: BLE001
                pass
            return {
                "status": "payment_required",
                "hospital": hospital_name,
                "summary": summary,
                "screenshot_url": screenshot_url if shot_path.exists() else None,
                "success": False,
                "payment_required": True,
            }

        # Capture confirmation screenshot from the live browser page when possible.
        shot_ok = False
        try:
            context = getattr(browser, "context", None) or getattr(browser, "browser_context", None)
            pages = []
            if context is not None:
                get_pages = getattr(context, "pages", None)
                pages = list(get_pages) if get_pages is not None else []
                if not pages and hasattr(context, "get_current_page"):
                    page = await context.get_current_page()
                    if page:
                        pages = [page]
            if pages:
                shot_ok = await _capture_screenshot(pages[-1], shot_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("final_screenshot_unavailable err=%s", type(exc).__name__)

        summary = _safe_summary(final_text) or (
            f"Booking attempt for {hospital_name} finished. Check the confirmation screen."
        )
        success = bool(final_text) and not re.search(
            r"\b(could not|failed|unable|login required|blocked)\b", final_text, re.I
        )

        return {
            "status": "completed" if success else "failed",
            "hospital": hospital_name,
            "summary": summary,
            "screenshot_url": screenshot_url if shot_ok and shot_path.exists() else None,
            "success": success,
            "payment_required": False,
            "patient_name": patient_name,
            "preferred_time": preferred_time,
            "reason_for_visit": reason_for_visit,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("booking_failed hospital=%r err=%s", hospital_name, type(exc).__name__)
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": (
                f"The browser agent could not complete the booking ({type(exc).__name__}). "
                "Try again later, or call Ambulance 911 / Toll-free 112 / Police 999 if urgent."
            ),
            "screenshot_url": screenshot_url if shot_path.exists() else None,
            "success": False,
            "payment_required": False,
        }
    finally:
        if browser is not None:
            try:
                close = getattr(browser, "close", None)
                if close:
                    maybe = close()
                    if asyncio.iscoroutine(maybe):
                        await maybe
            except Exception:  # noqa: BLE001
                pass
