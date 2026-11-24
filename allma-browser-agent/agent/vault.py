"""Encrypted credential vault for hospital portal logins.

Passwords are never written to stdout or returned to chat — only decrypted
in-process for the browser runner.
"""

from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())


class CredentialVault:
    """Fernet-encrypted JSON store for hospital portal credentials."""

    def __init__(
        self,
        vault_path: str | Path | None = None,
        secret_key: str | bytes | None = None,
    ) -> None:
        path = vault_path or os.getenv("VAULT_DB_PATH") or "/opt/allma-browser-agent/vault_store.enc"
        key = secret_key or os.getenv("VAULT_SECRET_KEY")
        if not key:
            raise RuntimeError("VAULT_SECRET_KEY is not configured")
        if isinstance(key, str):
            key = key.encode("utf-8")
        self._path = Path(path)
        self._fernet = Fernet(key)
        self._lock = threading.Lock()
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> dict[str, Any]:
        if not self._path.exists():
            return {"credentials": {}}
        raw = self._path.read_bytes()
        if not raw:
            return {"credentials": {}}
        try:
            plain = self._fernet.decrypt(raw)
        except InvalidToken as exc:
            raise RuntimeError("Vault decryption failed — check VAULT_SECRET_KEY") from exc
        data = json.loads(plain.decode("utf-8"))
        if not isinstance(data, dict):
            return {"credentials": {}}
        credentials = data.get("credentials")
        if not isinstance(credentials, dict):
            data["credentials"] = {}
        return data

    def _save(self, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        encrypted = self._fernet.encrypt(payload)
        tmp = self._path.with_suffix(self._path.suffix + ".tmp")
        tmp.write_bytes(encrypted)
        tmp.replace(self._path)
        try:
            os.chmod(self._path, 0o600)
        except OSError:
            pass

    def set_credentials(
        self,
        domain_key: str,
        username: str,
        password: str,
        notes: str | None = None,
    ) -> dict[str, str]:
        """Store username/password for a hospital domain or name key."""
        key = _normalize_key(domain_key)
        if not key:
            raise ValueError("domain_key is required")
        if not username or not password:
            raise ValueError("username and password are required")
        with self._lock:
            data = self._load()
            data["credentials"][key] = {
                "domain_key": domain_key.strip(),
                "username": username.strip(),
                # Password stays inside the encrypted blob only.
                "password": password,
                "notes": (notes or "").strip(),
            }
            self._save(data)
        # Never echo the password back.
        return {"domain_key": domain_key.strip(), "username": username.strip(), "status": "saved"}

    def get_credentials(self, domain_or_name: str) -> dict[str, str] | None:
        """Return decrypted credentials for a domain/name match, or None."""
        needle = _normalize_key(domain_or_name)
        if not needle:
            return None
        with self._lock:
            data = self._load()
            credentials = data.get("credentials") or {}
            exact = credentials.get(needle)
            if isinstance(exact, dict) and exact.get("username") and exact.get("password"):
                return {
                    "domain_key": str(exact.get("domain_key") or needle),
                    "username": str(exact["username"]),
                    "password": str(exact["password"]),
                    "notes": str(exact.get("notes") or ""),
                }
            for stored in credentials.values():
                if not isinstance(stored, dict):
                    continue
                domain_key = _normalize_key(str(stored.get("domain_key") or ""))
                if needle in domain_key or domain_key in needle:
                    if stored.get("username") and stored.get("password"):
                        return {
                            "domain_key": str(stored.get("domain_key") or domain_key),
                            "username": str(stored["username"]),
                            "password": str(stored["password"]),
                            "notes": str(stored.get("notes") or ""),
                        }
        return None

    def list_domains(self) -> list[str]:
        """List stored domain keys without secrets."""
        with self._lock:
            data = self._load()
            out: list[str] = []
            for stored in (data.get("credentials") or {}).values():
                if isinstance(stored, dict) and stored.get("domain_key"):
                    out.append(str(stored["domain_key"]))
            return sorted(set(out))
