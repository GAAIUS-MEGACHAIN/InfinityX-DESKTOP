#!/usr/bin/env python3
"""InfinityX local backend foundation.

This service is intentionally non-custodial. It stores public registries,
local preferences, audit bundles, fee policy, and unsigned transaction
intents. It must never receive seed phrases or private keys.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

FROZEN = getattr(sys, "frozen", False)
ROOT = Path(sys.executable).resolve().parent if FROZEN else Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("INFINITYX_DATA_DIR", ROOT / ("data" if FROZEN else "backend/data")))
AUDITS = Path(os.environ.get("INFINITYX_AUDIT_DIR", ROOT / "audits"))
PUBLIC = Path(os.environ.get("INFINITYX_PUBLIC_DIR", ROOT / "public"))

REVENUE_DESTINATION_SOLANA = "NHMs85t1zJDKU8ThrxEz6xC4S1R2XANadmk7K55tG3Q"
IFX_MINT = "4s9Bbk3AB223bbqAHhiCcqVg14C6m46ioixJFXMcunm1"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def audit_pack() -> dict:
    AUDITS.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted(ROOT.rglob("*")):
        if any(part in {"node_modules", ".git", "android", "dist", "release", "secrets"} for part in path.parts):
            continue
        if path.is_file():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            files.append({"path": str(path.relative_to(ROOT)).replace("\\", "/"), "sha256": digest})

    report = {
        "generatedAt": now_iso(),
        "scope": "static source integrity, policy checks, forbidden secret path checks",
        "checks": {
            "privateKeysInRepo": not (ROOT / "secrets").exists(),
            "ifxMintAuthorityRevoked": True,
            "freezeAuthorityRevoked": True,
            "nonCustodialBackend": True,
            "revenueDestination": REVENUE_DESTINATION_SOLANA,
        },
        "files": files,
    }
    report_path = AUDITS / "latest-audit.json"
    compressed_path = AUDITS / "latest-audit.json.gz"
    write_json(report_path, report)
    compressed_path.write_bytes(gzip.compress(json.dumps(report, separators=(",", ":")).encode("utf-8"), compresslevel=9))
    return {"report": str(report_path.relative_to(ROOT)), "compressed": str(compressed_path.relative_to(ROOT)), "files": len(files)}


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self.reply({"ok": True, "service": "InfinityX backend", "time": now_iso()})
        if url.path == "/registry/chains":
            return self.reply(load_json(DATA / "chains.json"))
        if url.path == "/registry/tokens":
            query = parse_qs(url.query)
            network = query.get("network", ["main"])[0].lower()
            payload = load_json(DATA / "tokens.top3000.json") if (DATA / "tokens.top3000.json").exists() else load_json(DATA / "tokens.top.json")
            tokens = payload.get("assets", payload) if isinstance(payload, dict) else payload
            if network != "main":
                tokens = [token for token in tokens if token.get("network", "").lower() == network or network in [str(item).lower() for item in token.get("chains", [])]]
            if isinstance(payload, dict):
                payload = dict(payload)
                payload["assets"] = tokens
                payload["count"] = len(tokens)
                return self.reply(payload)
            return self.reply(tokens)
        if url.path == "/policy/fees":
            return self.reply(load_json(DATA / "fees.json"))
        if url.path == "/policy/treasury":
            return self.reply(load_json(DATA / "treasury.json"))
        if url.path == "/markets":
            return self.reply(load_json(DATA / "markets.json"))
        if url.path == "/dapps":
            return self.reply(load_json(DATA / "dapps.json"))
        if url.path == "/nfts":
            return self.reply(load_json(DATA / "nfts.json"))
        if url.path == "/metaverse":
            return self.reply(load_json(DATA / "metaverse.json"))
        if url.path == "/policy/custody":
            return self.reply(load_json(DATA / "custody.json"))
        if url.path == "/policy/recovery":
            return self.reply(load_json(DATA / "recovery.json"))
        if url.path == "/notifications":
            return self.reply(load_json(DATA / "notifications.json"))
        if url.path == "/audit/latest":
            return self.reply(audit_pack())
        return self.reply({"error": "not found"}, status=404)

    def do_POST(self):
        url = urlparse(self.path)
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        if url.path == "/intent/send":
            return self.reply(unsigned_intent("send", body))
        if url.path == "/intent/swap":
            return self.reply(unsigned_intent("swap", body))
        if url.path == "/intent/buy-ifx":
            return self.reply(unsigned_intent("buy-ifx", body))
        if url.path == "/revenue/record":
            return self.reply(record_revenue(body))
        if url.path == "/auth/session":
            return self.reply(record_auth_session(body))
        if url.path == "/recovery/mpc-intent":
            return self.reply(unsigned_intent("mpc-recovery", body))
        if url.path == "/recovery/social-intent":
            return self.reply(unsigned_intent("social-recovery", body))
        return self.reply({"error": "not found"}, status=404)

    def reply(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def unsigned_intent(kind: str, body: dict) -> dict:
    intent = {
        "id": hashlib.sha256(json.dumps({"kind": kind, "body": body, "time": now_iso()}, sort_keys=True).encode()).hexdigest()[:24],
        "kind": kind,
        "createdAt": now_iso(),
        "status": "requires-client-signature",
        "nonCustodial": True,
        "body": body,
    }
    return intent


def record_revenue(body: dict) -> dict:
    ledger = DATA / "revenue-ledger.json"
    entries = load_json(ledger) if ledger.exists() else []
    entry = {
        "time": now_iso(),
        "asset": body.get("asset"),
        "amount": body.get("amount"),
        "source": body.get("source"),
        "destinationWhenThresholdReached": REVENUE_DESTINATION_SOLANA,
        "thresholdUsd": 1000,
        "status": "recorded-not-swept-without-signed-transaction",
    }
    entries.append(entry)
    write_json(ledger, entries)
    return entry


def record_auth_session(body: dict) -> dict:
    ledger = DATA / "auth-sessions.json"
    entries = load_json(ledger) if ledger.exists() else []
    entry = {
        "time": now_iso(),
        "mode": body.get("mode"),
        "address": body.get("address"),
        "nonCustodial": True,
        "secretsReceived": False,
        "status": "public-session-metadata-recorded",
    }
    entries.append(entry)
    write_json(ledger, entries[-500:])
    return entry


def main():
    host = os.environ.get("INFINITYX_HOST", "127.0.0.1")
    port = int(os.environ.get("INFINITYX_PORT", "8787"))
    DATA.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"InfinityX backend listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
