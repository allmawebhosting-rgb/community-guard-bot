"""Autonomous hospital appointment booking via browser-use + Playwright."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import uuid
from collections.abc import Awaitable, Callable
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

ProgressCallback = Callable[[dict[str, Any]], None]
AskUserCallback = Callable[[str], Awaitable[str]]


def _safe_summary(text: str, limit: int = 1200) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    # Redact anything that looks like a password assignment if the agent echoes UI labels poorly.
    cleaned = re.sub(r"(?i)(password|passwd|pwd)\s*[:=]\s*\S+", r"\1: [redacted]", cleaned)
    if len(cleaned) > limit:
        return cleaned[: limit - 1] + "…"
    return cleaned


def _is_placeholder_secret(value: str) -> bool:
    v = (value or "").strip()
    if not v:
        return True
    lower = v.lower()
    return (
        "your_" in lower
        or lower.endswith("_here")
        or lower in {"changeme", "replace_me", "xxx", "todo"}
    )


def _cf_model_name() -> str:
    return (
        os.getenv("BROWSER_AGENT_MODEL")
        or os.getenv("CLOUDFLARE_BROWSER_MODEL")
        or "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    ).strip()


def _flatten_message_content(content: Any) -> str:
    """Workers AI chat models expect string content, not OpenAI multimodal arrays."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                if part.get("type") == "text" or "text" in part:
                    parts.append(str(part.get("text") or ""))
                elif part.get("type") == "image_url":
                    parts.append("[image omitted]")
                else:
                    parts.append(str(part))
            else:
                text = getattr(part, "text", None)
                parts.append(str(text) if text is not None else str(part))
        return "\n".join(p for p in parts if p)
    return str(content)


def _normalize_messages_for_workers_ai(messages: Any) -> Any:
    """Copy LangChain messages with flattened string content for Cloudflare."""
    if not isinstance(messages, list):
        return messages
    out = []
    for msg in messages:
        try:
            content = _flatten_message_content(getattr(msg, "content", msg))
            if hasattr(msg, "model_copy"):
                out.append(msg.model_copy(update={"content": content}))
            elif hasattr(msg, "copy"):
                cloned = msg.copy()
                cloned.content = content
                out.append(cloned)
            else:
                out.append(msg)
        except Exception:  # noqa: BLE001
            out.append(msg)
    return out


def _normalize_openai_request_messages(messages: Any) -> list[dict[str, Any]]:
    """Rewrite OpenAI-wire messages for Workers AI (string content only)."""
    out: list[dict[str, Any]] = []
    if not isinstance(messages, list):
        return messages
    for msg in messages:
        if not isinstance(msg, dict):
            out.append(msg)
            continue
        fixed = dict(msg)
        fixed["content"] = _flatten_message_content(fixed.get("content"))
        # Drop null tool fields that confuse Workers AI schema validation.
        if fixed.get("tool_calls") is None:
            fixed.pop("tool_calls", None)
        if fixed.get("function_call") is None:
            fixed.pop("function_call", None)
        out.append(fixed)
    return out


def _wrap_workers_ai_llm(llm: Any) -> Any:
    """
    Patch the underlying OpenAI client so every chat.completions call flattens
    multimodal/null content. LangChain/browser-use otherwise POST arrays that
    Cloudflare Llama rejects.
    """

    def _patch_client(client: Any) -> None:
        if client is None or getattr(client, "_allma_cf_patched", False):
            return
        completions = client.chat.completions
        original_create = completions.create

        def create(*args: Any, **kwargs: Any):
            if "messages" in kwargs:
                kwargs["messages"] = _normalize_openai_request_messages(kwargs["messages"])
            # Workers AI ignores/breaks on some OpenAI-only fields.
            kwargs.pop("stream_options", None)
            return original_create(*args, **kwargs)

        completions.create = create  # type: ignore[method-assign]
        object.__setattr__(client, "_allma_cf_patched", True)

    # Force client construction (langchain may lazy-init), then patch wire calls.
    try:
        _ = llm.client
    except Exception:  # noqa: BLE001
        pass
    try:
        _ = llm.async_client
    except Exception:  # noqa: BLE001
        pass
    for attr in ("client", "async_client", "root_client", "root_async_client"):
        try:
            _patch_client(getattr(llm, attr, None))
        except Exception:  # noqa: BLE001
            logger.debug("cf_llm_patch_skip attr=%s", attr)

    # Also normalize at LangChain message layer when possible.
    original_ainvoke = llm.__class__.ainvoke
    original_invoke = llm.__class__.invoke

    async def ainvoke(self, input, config=None, **kwargs):  # noqa: ANN001,A002
        return await original_ainvoke(
            self, _normalize_messages_for_workers_ai(input), config=config, **kwargs
        )

    def invoke(self, input, config=None, **kwargs):  # noqa: ANN001,A002
        return original_invoke(
            self, _normalize_messages_for_workers_ai(input), config=config, **kwargs
        )

    import types

    object.__setattr__(llm, "ainvoke", types.MethodType(ainvoke, llm))
    object.__setattr__(llm, "invoke", types.MethodType(invoke, llm))
    return llm


def _resolve_llm() -> tuple[Any, str, bool]:
    """
    Build a LangChain chat model for browser-use.

    Preference:
      1) Allma Workers AI proxy (BROWSER_AGENT_LLM_BASE_URL) — reuses the
         Cloudflare Workers AI binding already powering Allma chat
      2) Cloudflare Workers AI REST API (CLOUDFLARE_ACCOUNT_ID + API token)
      3) OpenAI (OPENAI_API_KEY)

    Returns (llm, provider_label, use_vision).
    """
    from langchain_openai import ChatOpenAI

    use_vision_cf = os.getenv("BROWSER_AGENT_USE_VISION", "false").lower() in {
        "1",
        "true",
        "yes",
    }
    cf_model = _cf_model_name()
    if not cf_model.startswith("@cf/") and not cf_model.startswith("@hf/"):
        cf_model = f"@cf/{cf_model.lstrip('@')}"

    # 1) Proxy through the Allma Cloudflare Worker (same AI binding as chat)
    proxy_base = (os.getenv("BROWSER_AGENT_LLM_BASE_URL") or "").strip().rstrip("/")
    proxy_key = (
        os.getenv("BROWSER_AGENT_LLM_API_KEY")
        or os.getenv("VPS_AGENT_SECRET_TOKEN")
        or ""
    ).strip()
    if proxy_base and not _is_placeholder_secret(proxy_key):
        llm = _wrap_workers_ai_llm(
            ChatOpenAI(
                model=cf_model,
                api_key=proxy_key,
                base_url=proxy_base,
                temperature=0,
            )
        )
        return llm, f"allma-workers-ai-proxy:{cf_model}", use_vision_cf

    # 2) Direct Cloudflare Workers AI OpenAI-compatible REST API
    cf_account = (os.getenv("CLOUDFLARE_ACCOUNT_ID") or "").strip()
    cf_token = (
        os.getenv("CLOUDFLARE_API_TOKEN")
        or os.getenv("CLOUDFLARE_API_KEY")
        or ""
    ).strip()
    if cf_account and not _is_placeholder_secret(cf_token):
        base_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/ai/v1"
        llm = _wrap_workers_ai_llm(
            ChatOpenAI(
                model=cf_model,
                api_key=cf_token,
                base_url=base_url,
                temperature=0,
            )
        )
        return llm, f"cloudflare-workers-ai:{cf_model}", use_vision_cf

    # 3) OpenAI
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not _is_placeholder_secret(openai_key):
        model_name = (os.getenv("BROWSER_AGENT_MODEL") or "gpt-4o").strip() or "gpt-4o"
        if model_name.startswith("@cf/") or model_name.startswith("@hf/"):
            model_name = "gpt-4o"
        use_vision = os.getenv("BROWSER_AGENT_USE_VISION", "true").lower() not in {
            "0",
            "false",
            "no",
        }
        llm = ChatOpenAI(model=model_name, api_key=openai_key, temperature=0)
        return llm, f"openai:{model_name}", use_vision

    raise RuntimeError(
        "No LLM configured. Use Cloudflare Workers AI: set "
        "BROWSER_AGENT_LLM_BASE_URL=https://allmasafetyai.online/api/browser-llm/v1 "
        "(after deploy) with VPS_AGENT_SECRET_TOKEN, OR set "
        "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, OR a real OPENAI_API_KEY."
    )


async def _preflight_llm(llm: Any, provider_label: str) -> str | None:
    """
    Cheap connectivity check. Returns an error summary if the LLM path is dead,
    so we fail before launching Playwright.
    """
    try:
        # LangChain ChatOpenAI supports ainvoke with a simple HumanMessage.
        from langchain_core.messages import HumanMessage

        await asyncio.wait_for(
            llm.ainvoke([HumanMessage(content="Reply with exactly: ok")]),
            timeout=45,
        )
        return None
    except Exception as exc:  # noqa: BLE001
        err = str(exc)
        lower = err.lower()
        if (
            "404" in err
            or "406" in err
            or "not found" in lower
            or "only html requests" in lower
        ):
            return (
                "Workers AI proxy is not live on Allma yet "
                "(redeploy after the /api/browser-llm route landed). "
                "Until then set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN "
                "on the VPS agent .env — same Cloudflare account as Workers AI."
            )
        if "401" in err or "403" in err or "unauthorized" in lower:
            return (
                f"LLM provider {provider_label} rejected the API token. "
                "Check VPS_AGENT_SECRET_TOKEN matches the Allma Worker secret, "
                "or refresh CLOUDFLARE_API_TOKEN."
            )
        return f"LLM provider {provider_label} failed: {type(exc).__name__}: {_safe_summary(err, 240)}"


# Direct portals only — search engines (Google/DuckDuckGo/Bing) show bot CAPTCHAs
# to headless browsers and must never be used for discovery.
KNOWN_PORTALS: dict[str, dict[str, str]] = {
    "mengo hospital": {
        "url": "https://www.mengohospital.org/",
        "phone": "+256414270222",
    },
    "mulago": {
        "url": "https://mulago.or.ug/",
        "phone": "+256414554000",
    },
    "nsambya": {
        "url": "https://www.nsambyahospital.or.ug/",
        "phone": "+256414267012",
    },
    "case hospital": {
        "url": "https://www.casehospital.com/",
        "phone": "+256312250500",
    },
    "jinja main hospital": {
        "url": "https://jinjahospital.go.ug/",
        "phone": "+256414674584",
    },
    "jinja regional referral": {
        "url": "https://jinjahospital.go.ug/",
        "phone": "+256414674584",
    },
    "jinja referral": {
        "url": "https://jinjahospital.go.ug/",
        "phone": "+256414674584",
    },
    "jinja hospital": {
        "url": "https://jinjahospital.go.ug/",
        "phone": "+256414674584",
    },
}

CAPTCHA_RE = re.compile(
    r"\b(captcha|recaptcha|hcaptcha|challenge|confirm .{0,40}human|not a robot|"
    r"unusual traffic|verify you are|are you a robot|select all (images|squares)|"
    r"complete the challenge)\b",
    re.I,
)


def _known_portal(hospital_name: str) -> dict[str, str]:
    key = hospital_name.strip().lower()
    for name, meta in KNOWN_PORTALS.items():
        if name in key or key in name:
            return dict(meta)
    return {}


def _portal_hint(hospital_name: str, portal_url: str, clinic_phone: str) -> str:
    if portal_url:
        return (
            f'1. Open this official clinic page DIRECTLY (do not search): {portal_url}\n'
            f'2. Look for Appointment / Book / Contact / WhatsApp on that site only.'
        )
    known = _known_portal(hospital_name)
    if known.get("url"):
        return (
            f'1. Open this official clinic page DIRECTLY (do not search): {known["url"]}\n'
            f'2. Look for Appointment / Book / Contact / WhatsApp on that site only.'
        )
    phone = clinic_phone or known.get("phone") or ""
    phone_line = f" Clinic phone on file: {phone}." if phone else ""
    return (
        f'1. There is no verified online booking URL for "{hospital_name}".{phone_line}\n'
        f'2. Do NOT open Google, DuckDuckGo, Bing, or any search engine.\n'
        f'3. STOP immediately and report that online booking is unavailable and the patient should call the clinic phone.'
    )


def _build_task_prompt(
    *,
    hospital_name: str,
    patient_name: str,
    phone_number: str,
    preferred_time: str,
    reason_for_visit: str,
    has_credentials: bool,
    portal_url: str,
    clinic_phone: str,
) -> str:
    login_block = (
        "If the portal requires login and credentials were provided via sensitive_data placeholders "
        "(x_username / x_password), enter those saved credentials. Never invent credentials. "
        "Never print or speak the password."
        if has_credentials
        else "If the portal requires login and no saved credentials exist, stop and report that "
        "login is required so a human can save credentials in the vault."
    )
    find_block = _portal_hint(hospital_name, portal_url, clinic_phone)
    phone_fallback = clinic_phone or _known_portal(hospital_name).get("phone") or ""
    return f"""
You are booking a medical appointment for Allma Safety AI. Work carefully and stop if payment is required.

Goals:
{find_block}
3. {login_block}
4. Find and select an appointment slot matching "{preferred_time}" (or the closest available slot if exact match is unavailable — say what you picked).
5. Fill the booking form with:
   - Patient name: {patient_name or "(not provided)"}
   - Phone number: {phone_number or "(not provided)"}
   - Reason for visit / symptoms: {reason_for_visit}
6. Submit the booking and reach the confirmation / reference screen.
7. Extract any confirmation number, doctor/department, and date/time shown.

Asking the patient (important):
- If the form needs a detail you were NOT given above (date of birth, email, age, gender, doctor or department choice, ID number, which time slot, insurance, anything else), call the ask_user action with ONE short plain-language question. Never guess, never type N/A or a made-up value.
- When several slots or doctors are available, ask_user which one the patient wants instead of choosing silently.
- Use the patient's answer exactly, then continue filling the form.

Hard rules:
- NEVER open google.com, duckduckgo.com, bing.com, yahoo.com, or ANY search engine. They show CAPTCHA challenges to bots and waste the whole run.
- If you see a CAPTCHA / "confirm you are human" / "unusual traffic" page, STOP immediately. Do not click challenge squares. Report captcha_blocked=true
  and give the clinic phone{" (" + phone_fallback + ")" if phone_fallback else ""} so the patient can call to book.
- Do NOT enter credit card, debit card, CVV, or any payment details.
- If the site demands payment to continue, STOP immediately and report payment_required=true.
- If there is no online booking form (only a phone number / WhatsApp), STOP and report the phone/WhatsApp contact clearly — that is a valid outcome.
- Do not invent a booking confirmation. Only report what the page shows.
- Keep actions focused; finish when confirmation is visible, contact details are found, or when blocked.
""".strip()


CONFIRMED_BOOKING_RE = re.compile(
    r"\b(confirmation\s*(no|number|#|id)|reference\s*(no|number|#)|"
    r"appointment\s+(is\s+)?(confirmed|booked)|successfully\s+booked|"
    r"booking\s+confirmed|reservation\s+confirmed)\b",
    re.I,
)
CONTACT_ONLY_RE = re.compile(
    r"\b(online booking not available|no online booking|cannot book online|"
    r"could not book online|booking (is )?not available|call (the )?(hospital|clinic)|"
    r"contact .{0,40}(at|on)|please call|phone( number)?[:\s]|whatsapp|"
    r"email\s+\S+@\S+|report the contact)\b",
    re.I,
)
PHONE_IN_TEXT_RE = re.compile(
    r"(?:\+?256[\s-]*)?(?:0?4\d{1,2}|7\d{1,2})[\s-]?\d{3}[\s-]?\d{3,4}|\+\d{10,15}"
)


def _extract_phone_from_text(text: str) -> str:
    match = PHONE_IN_TEXT_RE.search(text or "")
    if not match:
        return ""
    digits = re.sub(r"[^\d+]", "", match.group(0))
    return digits


def _is_contact_only_outcome(text: str) -> bool:
    t = text or ""
    if CONFIRMED_BOOKING_RE.search(t):
        return False
    return bool(CONTACT_ONLY_RE.search(t))


def _phone_booking_result(
    *,
    hospital_name: str,
    preferred_time: str,
    reason_for_visit: str,
    clinic_phone: str,
    reason: str,
    steps: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    phone = clinic_phone or _known_portal(hospital_name).get("phone") or ""
    summary = (
        f"{reason} "
        + (
            f"Please call {hospital_name} on {phone} to book for {preferred_time} "
            f"({reason_for_visit})."
            if phone
            else f"Please call {hospital_name} directly to book for {preferred_time} "
            f"({reason_for_visit}). I could not find a public online booking page."
        )
    ).strip()
    return {
        "status": "phone_booking",
        "hospital": hospital_name,
        "summary": summary,
        "screenshot_url": None,
        "screenshots": [],
        "steps": steps
        or [
            {"label": "Online booking unavailable without a search engine", "status": "failed"},
            {
                "label": f"Call {phone or hospital_name} to book" if phone else "Call the clinic to book",
                "status": "phone_booking",
            },
        ],
        "success": False,
        "payment_required": False,
        "clinic_phone": phone or None,
        "preferred_time": preferred_time,
        "reason_for_visit": reason_for_visit,
    }


async def _capture_screenshot(page: Any, path: Path) -> bool:
    try:
        await page.screenshot(path=str(path), full_page=True)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("screenshot_failed err=%s", type(exc).__name__)
        return False


def _save_b64_screenshot(screenshot_b64: str | None, path: Path) -> bool:
    if not screenshot_b64:
        return False
    try:
        raw = base64.b64decode(screenshot_b64)
        path.write_bytes(raw)
        return path.exists() and path.stat().st_size > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("b64_screenshot_failed err=%s", type(exc).__name__)
        return False


def _step_label(model_output: Any, n_steps: int, url: str | None) -> str:
    try:
        brain = getattr(model_output, "current_state", None)
        goal = getattr(brain, "next_goal", None) if brain is not None else None
        if isinstance(goal, str) and goal.strip():
            return _safe_summary(goal.strip(), 140)
    except Exception:  # noqa: BLE001
        pass
    host = ""
    if url:
        try:
            host = re.sub(r"^https?://", "", url).split("/")[0]
        except Exception:  # noqa: BLE001
            host = ""
    return f"Step {n_steps}" + (f" · {host}" if host else "")


async def run_booking_task(
    hospital_name: str,
    patient_name: str,
    phone_number: str,
    preferred_time: str,
    reason_for_visit: str,
    portal_url: str = "",
    clinic_phone: str = "",
    on_progress: ProgressCallback | None = None,
    ask_user: AskUserCallback | None = None,
) -> dict[str, Any]:
    """Run the browser agent and return a structured booking result (no secrets)."""
    hospital_name = (hospital_name or "").strip()
    patient_name = (patient_name or "").strip()
    phone_number = (phone_number or "").strip()
    preferred_time = (preferred_time or "").strip() or "soonest available"
    reason_for_visit = (reason_for_visit or "").strip() or "Medical consultation"
    portal_url = (portal_url or "").strip()
    clinic_phone = (clinic_phone or "").strip()
    known = _known_portal(hospital_name)
    if not portal_url:
        portal_url = (known.get("url") or "").strip()
    if not clinic_phone:
        clinic_phone = (known.get("phone") or "").strip()

    if not hospital_name:
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": "Hospital name is required.",
            "screenshot_url": None,
            "screenshots": [],
            "steps": [],
            "success": False,
            "payment_required": False,
        }

    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    shot_id = str(uuid.uuid4())
    shot_path = SCREENSHOT_DIR / f"{shot_id}.png"
    screenshot_url = f"/screenshots/{shot_id}.png"
    process_steps: list[dict[str, Any]] = []
    screenshot_urls: list[str] = []

    def emit(label: str, *, shot: str | None = None, status: str = "running") -> None:
        entry = {
            "label": label,
            "screenshot_url": shot,
            "status": status,
        }
        process_steps.append(entry)
        if shot and shot not in screenshot_urls:
            screenshot_urls.append(shot)
        if on_progress:
            try:
                on_progress(
                    {
                        "status": status,
                        "summary": label,
                        "steps": list(process_steps),
                        "screenshots": list(screenshot_urls),
                        "screenshot_url": shot or (screenshot_urls[-1] if screenshot_urls else None),
                        "hospital": hospital_name,
                    }
                )
            except Exception:  # noqa: BLE001
                pass

    emit("Starting browser booking agent…")

    # No safe direct website → skip Playwright entirely (search engines = CAPTCHA loops).
    if not portal_url or CAPTCHA_RE.search(portal_url) or re.search(
        r"google\.|duckduckgo\.|bing\.|yahoo\.", portal_url, re.I
    ):
        emit(
            "No direct clinic website — skipping search engines to avoid CAPTCHA",
            status="phone_booking",
        )
        result = _phone_booking_result(
            hospital_name=hospital_name,
            preferred_time=preferred_time,
            reason_for_visit=reason_for_visit,
            clinic_phone=clinic_phone,
            reason=(
                "Online booking needs a direct clinic website, and search engines block "
                "automated browsers with human-verification challenges."
            ),
            steps=process_steps,
        )
        if on_progress:
            on_progress(
                {
                    "status": "phone_booking",
                    "summary": result["summary"],
                    "steps": result["steps"],
                    "screenshots": [],
                    "screenshot_url": None,
                    "hospital": hospital_name,
                }
            )
        return result

    vault = CredentialVault()
    creds = vault.get_credentials(hospital_name)
    has_credentials = bool(creds)
    # Never log username/password values.
    logger.info(
        "booking_start hospital=%r has_credentials=%s portal=%r",
        hospital_name,
        has_credentials,
        portal_url,
    )

    try:
        llm, provider_label, use_vision = _resolve_llm()
    except RuntimeError as exc:
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": str(exc),
            "screenshot_url": None,
            "success": False,
            "payment_required": False,
        }

    logger.info("booking_llm provider=%s use_vision=%s", provider_label, use_vision)

    preflight_err = await _preflight_llm(llm, provider_label)
    if preflight_err:
        logger.error("booking_llm_preflight_failed provider=%s", provider_label)
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": preflight_err,
            "screenshot_url": None,
            "success": False,
            "payment_required": False,
        }

    task = _build_task_prompt(
        hospital_name=hospital_name,
        patient_name=patient_name,
        phone_number=phone_number,
        preferred_time=preferred_time,
        reason_for_visit=reason_for_visit,
        has_credentials=has_credentials,
        portal_url=portal_url,
        clinic_phone=clinic_phone,
    )

    sensitive_data: dict[str, str] | None = None
    if creds:
        sensitive_data = {
            "x_username": creds["username"],
            "x_password": creds["password"],
        }

    try:
        from browser_use import Agent, Browser, BrowserConfig
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

        captcha_hits = {"count": 0}
        agent_ref: dict[str, Any] = {"agent": None}

        async def on_step(state: Any, model_output: Any, n_steps: int) -> None:
            url = getattr(state, "url", None)
            url_s = url if isinstance(url, str) else ""
            label = _step_label(model_output, n_steps, url_s or None)
            shot_rel: str | None = None
            take_shot = n_steps <= 1 or n_steps % 3 == 0
            if take_shot:
                step_id = f"{shot_id}-s{n_steps}"
                step_path = SCREENSHOT_DIR / f"{step_id}.png"
                b64 = getattr(state, "screenshot", None)
                saved = _save_b64_screenshot(b64 if isinstance(b64, str) else None, step_path)
                if saved:
                    shot_rel = f"/screenshots/{step_id}.png"
            emit(label, shot=shot_rel)

            blocked = bool(
                CAPTCHA_RE.search(label)
                or CAPTCHA_RE.search(url_s)
                or re.search(r"google\.|duckduckgo\.|bing\.|yahoo\.", url_s, re.I)
            )
            if blocked:
                captcha_hits["count"] += 1
                emit(
                    "Human-verification / search page detected — stopping to avoid a CAPTCHA loop",
                    shot=shot_rel,
                    status="captcha_blocked",
                )
                agent = agent_ref.get("agent")
                if agent is not None and hasattr(agent, "stop"):
                    agent.stop()

        controller = None
        ask_patient = ask_user
        if ask_patient is not None:
            try:
                from browser_use import ActionResult, Controller

                controller = Controller()

                @controller.action(
                    "Ask the patient ONE short question when the booking form needs a detail "
                    "you were not given (date of birth, email, doctor, time slot, ...). "
                    "Waits for the real answer. Never guess instead."
                )
                async def ask_user(question: str) -> ActionResult:  # noqa: F811
                    emit(f"Asking you: {question}", status="running")
                    answer = await ask_patient(question)
                    emit("Got your answer — continuing…", status="running")
                    return ActionResult(
                        extracted_content=f"The patient answered: {answer}",
                        include_in_memory=True,
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning("ask_user_unavailable err=%s", type(exc).__name__)
                controller = None

        agent_kwargs: dict[str, Any] = {
            "task": task,
            "llm": llm,
            "browser": browser,
            "use_vision": use_vision,
            "max_actions_per_step": 6,
            # mem0 defaults to OpenAI embeddings; disable so Cloudflare-only works
            "enable_memory": False,
            # Workers AI tool-calling is prompt/JSON oriented, not OpenAI tools
            "tool_calling_method": "raw" if "cloudflare" in provider_label or "workers-ai" in provider_label else "auto",
            "register_new_step_callback": on_step,
        }
        if sensitive_data:
            agent_kwargs["sensitive_data"] = sensitive_data
        if controller is not None:
            agent_kwargs["controller"] = controller

        agent = Agent(**agent_kwargs)
        agent_ref["agent"] = agent
        max_steps = int(os.getenv("BROWSER_AGENT_MAX_STEPS", "25") or "25")
        emit(f"Opening clinic website: {portal_url}")
        history = await agent.run(max_steps=max_steps)

        if captcha_hits["count"] > 0:
            return _phone_booking_result(
                hospital_name=hospital_name,
                preferred_time=preferred_time,
                reason_for_visit=reason_for_visit,
                clinic_phone=clinic_phone,
                reason=(
                    "The clinic path hit a human-verification challenge that automated "
                    "browsers cannot complete."
                ),
                steps=process_steps,
            )

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

        # Capture confirmation / final page screenshot from the live browser.
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

        final_shot = screenshot_url if shot_ok and shot_path.exists() else (
            screenshot_urls[-1] if screenshot_urls else None
        )
        if final_shot and final_shot not in screenshot_urls:
            screenshot_urls.append(final_shot)

        if payment_required:
            summary = (
                "The portal asked for payment details. Booking was stopped before any card "
                "information was entered. Please complete payment yourself on the hospital site, "
                "or call Ambulance 911 / Toll-free 112 / Police 999 if this is urgent."
            )
            emit("Stopped at payment gate", shot=final_shot, status="payment_required")
            return {
                "status": "payment_required",
                "hospital": hospital_name,
                "summary": summary,
                "screenshot_url": final_shot,
                "screenshots": screenshot_urls,
                "steps": process_steps,
                "success": False,
                "payment_required": True,
            }

        summary = _safe_summary(final_text) or (
            f"Booking attempt for {hospital_name} finished. Check the confirmation screen."
        )

        # Contact-only pages (phone/email, no form) are NOT confirmed bookings.
        if _is_contact_only_outcome(final_text) or (
            final_text and not CONFIRMED_BOOKING_RE.search(final_text)
            and re.search(r"\b(call|contact|email|phone)\b", final_text, re.I)
            and not re.search(r"\b(confirmation|booked successfully|appointment confirmed)\b", final_text, re.I)
        ):
            extracted = _extract_phone_from_text(final_text) or clinic_phone
            emit("Online booking unavailable — sharing clinic contact", shot=final_shot, status="phone_booking")
            return {
                **_phone_booking_result(
                    hospital_name=hospital_name,
                    preferred_time=preferred_time,
                    reason_for_visit=reason_for_visit,
                    clinic_phone=extracted,
                    reason=summary if summary else "Online booking is not available on this clinic site.",
                    steps=process_steps,
                ),
                "screenshot_url": final_shot,
                "screenshots": screenshot_urls,
                "summary": summary
                if summary
                else _phone_booking_result(
                    hospital_name=hospital_name,
                    preferred_time=preferred_time,
                    reason_for_visit=reason_for_visit,
                    clinic_phone=extracted,
                    reason="Online booking is not available on this clinic site.",
                )["summary"],
            }

        success = bool(final_text) and bool(CONFIRMED_BOOKING_RE.search(final_text))
        emit(
            "Booking confirmed" if success else "Booking finished — needs review",
            shot=final_shot,
            status="completed" if success else "failed",
        )

        return {
            "status": "completed" if success else "failed",
            "hospital": hospital_name,
            "summary": summary,
            "screenshot_url": final_shot,
            "screenshots": screenshot_urls,
            "steps": process_steps,
            "success": success,
            "payment_required": False,
            "clinic_phone": clinic_phone or _extract_phone_from_text(final_text) or None,
            "patient_name": patient_name,
            "preferred_time": preferred_time,
            "reason_for_visit": reason_for_visit,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("booking_failed hospital=%r err=%s", hospital_name, type(exc).__name__)
        emit(f"Browser agent error ({type(exc).__name__})", status="failed")
        return {
            "status": "failed",
            "hospital": hospital_name,
            "summary": (
                f"The browser agent could not complete the booking ({type(exc).__name__}). "
                "Try again later, or call Ambulance 911 / Toll-free 112 / Police 999 if urgent."
            ),
            "screenshot_url": screenshot_url if shot_path.exists() else (
                screenshot_urls[-1] if screenshot_urls else None
            ),
            "screenshots": screenshot_urls,
            "steps": process_steps,
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
