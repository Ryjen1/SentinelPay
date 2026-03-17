import requests
import time
import uuid
import json
import hashlib
import hmac


class SentinelPayClient:
    def __init__(
        self,
        backend_url: str,
        agent_id: str,
        operator_api_key: str | None = None,
        agent_shared_secret: str | None = None,
    ):
        self.backend_url = backend_url.rstrip("/")
        self.agent_id = agent_id
        self.operator_api_key = operator_api_key
        self.agent_shared_secret = agent_shared_secret

    def _agent_signature_headers(self, method: str, path: str, payload: dict) -> dict:
        if not self.agent_shared_secret:
            return {}
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        body_hash = hashlib.sha256(body.encode()).hexdigest()
        timestamp = str(int(time.time()))
        message = f"{self.agent_id}:{timestamp}:{method.upper()}:{path}:{body_hash}"
        signature = hmac.new(
            self.agent_shared_secret.encode(),
            message.encode(),
            hashlib.sha256,
        ).hexdigest()
        return {
            "X-Agent-Id": self.agent_id,
            "X-Agent-Timestamp": timestamp,
            "X-Agent-Signature": signature,
        }

    def _write_headers(self, *, method: str, path: str, payload: dict, idempotency_key: str | None) -> dict:
        headers = {"Idempotency-Key": idempotency_key or uuid.uuid4().hex}
        if self.operator_api_key:
            headers["X-Operator-Key"] = self.operator_api_key
        headers.update(self._agent_signature_headers(method, path, payload))
        return headers

    def execute_payment(self, amount: float, recipient: str, idempotency_key: str | None = None) -> dict:
        path = "/execute-payment"
        payload = {
            "agent_id": self.agent_id,
            "amount_usdc": amount,
            "recipient": recipient,
        }
        resp = requests.post(
            f"{self.backend_url}{path}",
            json=payload,
            headers=self._write_headers(method="POST", path=path, payload=payload, idempotency_key=idempotency_key),
            timeout=180,
        )
        resp.raise_for_status()
        return resp.json()

    def execute_demo(self, idempotency_key: str | None = None) -> dict:
        path = "/execute-demo"
        payload = {"agent_id": self.agent_id}
        resp = requests.post(
            f"{self.backend_url}{path}",
            json=payload,
            headers=self._write_headers(method="POST", path=path, payload=payload, idempotency_key=idempotency_key),
            timeout=180,
        )
        resp.raise_for_status()
        return resp.json()

    def get_executions(self) -> list:
        resp = requests.get(f"{self.backend_url}/executions", timeout=30)
        resp.raise_for_status()
        return resp.json().get("executions", [])

    def get_vault_balance(self) -> str:
        resp = requests.get(f"{self.backend_url}/vault-balance", timeout=30)
        resp.raise_for_status()
        return resp.json().get("balance_usdc", "0.00")
