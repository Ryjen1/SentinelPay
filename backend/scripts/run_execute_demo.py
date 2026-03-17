import argparse
import os
import json
import httpx
import uuid
import time
import hashlib
import hmac
from pathlib import Path

from dotenv import load_dotenv


def load_env() -> None:
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir.parent
    repo_root = backend_dir.parent
    load_dotenv(dotenv_path=backend_dir / ".env")
    load_dotenv(dotenv_path=repo_root / ".env")


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Validate imports and env without sending a tx")
    args = parser.parse_args()

    base_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    execute_url = f"{base_url}/execute-demo"
    executions_url = f"{base_url}/executions"
    agent_id = os.getenv("DEFAULT_AGENT_ID", "weather_agent")
    operator_api_key = os.getenv("OPERATOR_API_KEY")
    agent_shared_secret = os.getenv("AGENT_SHARED_SECRET")

    if args.dry_run:
        print("[demo] dry-run mode enabled")
        print(f"[demo] BACKEND_URL={base_url}")
        print("[demo] dry-run ok")
        return 0

    print(f"[demo] POST {execute_url}")
    payload = {"agent_id": agent_id}
    payload_text = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    headers = {"Idempotency-Key": uuid.uuid4().hex}
    if operator_api_key:
        headers["X-Operator-Key"] = operator_api_key
    if agent_shared_secret:
        body_hash = hashlib.sha256(payload_text.encode()).hexdigest()
        timestamp = str(int(time.time()))
        message = f"{agent_id}:{timestamp}:POST:/execute-demo:{body_hash}"
        signature = hmac.new(agent_shared_secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        headers["X-Agent-Id"] = agent_id
        headers["X-Agent-Timestamp"] = timestamp
        headers["X-Agent-Signature"] = signature
    headers["Content-Type"] = "application/json"

    with httpx.Client(timeout=180) as client:
        resp = client.post(execute_url, content=payload_text, headers=headers)
        print(f"[demo] status={resp.status_code}")
        try:
            payload = resp.json()
        except Exception:
            payload = {"raw": resp.text}
        print("[demo] response:")
        print(json.dumps(payload, indent=2))

        print(f"[demo] GET {executions_url}")
        resp2 = client.get(executions_url)
        print(f"[demo] status={resp2.status_code}")
        try:
            payload2 = resp2.json()
        except Exception:
            payload2 = {"raw": resp2.text}
        print("[demo] executions:")
        print(json.dumps(payload2, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
