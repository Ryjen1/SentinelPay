import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv


def load_env() -> None:
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir.parent
    repo_root = backend_dir.parent
    load_dotenv(dotenv_path=backend_dir / ".env")
    load_dotenv(dotenv_path=repo_root / ".env")


def build_headers(*, path: str, payload_text: str, agent_id: str) -> dict:
    headers = {"Idempotency-Key": uuid.uuid4().hex}

    operator_api_key = os.getenv("OPERATOR_API_KEY")
    agent_shared_secret = os.getenv("AGENT_SHARED_SECRET")
    if operator_api_key:
        headers["X-Operator-Key"] = operator_api_key

    if agent_shared_secret:
        body_hash = hashlib.sha256(payload_text.encode()).hexdigest()
        timestamp = str(int(time.time()))
        message = f"{agent_id}:{timestamp}:POST:{path}:{body_hash}"
        signature = hmac.new(agent_shared_secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        headers["X-Agent-Id"] = agent_id
        headers["X-Agent-Timestamp"] = timestamp
        headers["X-Agent-Signature"] = signature

    return headers


def print_json(name: str, payload: dict) -> None:
    print(f"\n=== {name} ===")
    print(json.dumps(payload, indent=2))


def get_json(client: httpx.Client, url: str, name: str) -> dict:
    response = client.get(url)
    if response.status_code >= 400:
        raise RuntimeError(f"{name} failed ({response.status_code}): {response.text}")
    return response.json()


def ensure_execution_recorded(
    client: httpx.Client,
    executions_url: str,
    tx_hash: str,
    timeout_seconds: int = 25,
) -> Optional[dict]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        payload = get_json(client, executions_url, "GET /executions")
        executions = payload.get("executions", [])
        for row in executions:
            if str(row.get("tx_hash", "")).lower() == tx_hash.lower():
                return row
        time.sleep(2)
    return None


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(description="System smoke test for SentinelPay backend")
    parser.add_argument("--execute-demo", action="store_true", help="Trigger /execute-demo (real tx in non-mock mode)")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--agent-id", default=os.getenv("DEFAULT_AGENT_ID", "weather_agent"))
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    health_url = f"{base_url}/health"
    network_info_url = f"{base_url}/network-info"
    vault_balance_url = f"{base_url}/vault-balance"
    jobs_url = f"{base_url}/payment-jobs?limit=5"
    execute_demo_url = f"{base_url}/execute-demo"
    executions_url = f"{base_url}/executions"

    print("[smoke] starting SentinelPay smoke checks")
    print(f"[smoke] base_url={base_url}")

    with httpx.Client(timeout=180) as client:
        health = get_json(client, health_url, "GET /health")
        print_json("Health", health)

        network = get_json(client, network_info_url, "GET /network-info")
        print_json("Network", network)

        try:
            balance = get_json(client, vault_balance_url, "GET /vault-balance")
            print_json("Vault Balance", balance)
        except Exception as exc:
            print(f"[smoke] warning: vault balance check failed: {exc}")

        try:
            jobs = get_json(client, jobs_url, "GET /payment-jobs")
            print_json("Recent Payment Jobs", jobs)
        except Exception as exc:
            print(f"[smoke] warning: payment jobs check failed: {exc}")

        if not args.execute_demo:
            print("[smoke] dry smoke complete (no on-chain execution attempted)")
            return 0

        payload = {"agent_id": args.agent_id}
        payload_text = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        headers = build_headers(path="/execute-demo", payload_text=payload_text, agent_id=args.agent_id)
        headers["Content-Type"] = "application/json"
        response = client.post(execute_demo_url, content=payload_text, headers=headers)
        if response.status_code >= 400:
            raise RuntimeError(f"POST /execute-demo failed ({response.status_code}): {response.text}")

        execution = response.json()
        print_json("Execute Demo Response", execution)

        tx_hash = execution.get("tx_hash")
        if not tx_hash:
            raise RuntimeError("execute-demo returned no tx_hash")

        tx_url = execution.get("tx_url")
        if tx_url:
            print(f"[smoke] explorer: {tx_url}")

        row = ensure_execution_recorded(client, executions_url, tx_hash)
        if not row:
            raise RuntimeError("tx_hash not found in /executions within timeout")

        print_json("Execution Feed Match", row)
        print("[smoke] full smoke complete")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[smoke] interrupted")
        raise SystemExit(130)
    except Exception as exc:
        print(f"[smoke] failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
