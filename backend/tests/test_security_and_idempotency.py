import asyncio
import importlib
import os
import json
import time
import unittest

from fastapi import HTTPException
from starlette.requests import Request

os.environ["MOCK_PAYMENT"] = "true"
os.environ["REQUIRE_OPERATOR_AUTH"] = "true"
os.environ["OPERATOR_API_KEYS"] = "test-operator-key"
os.environ["REQUIRE_IDEMPOTENCY_KEY"] = "true"
os.environ["DEFAULT_RECIPIENT"] = "0x61254AEcF84eEdb890f07dD29f7F3cd3b8Eb2CBe"

main = importlib.import_module("main")


class InMemoryIdempotencyDb:
    def __init__(self):
        self.records = {}

    async def get_idempotency_record(self, key):
        return self.records.get(key)

    async def create_idempotency_record(self, *, key, endpoint, request_hash):
        if key in self.records:
            return False
        self.records[key] = {
            "idempotency_key": key,
            "endpoint": endpoint,
            "request_hash": request_hash,
            "status": "in_progress",
            "response_json": None,
            "error_json": None,
        }
        return True

    async def finalize_idempotency_record(self, *, key, status, response_json, error_json):
        record = self.records[key]
        record["status"] = status
        record["response_json"] = response_json
        record["error_json"] = error_json


class SecurityAndIdempotencyTests(unittest.TestCase):
    def setUp(self):
        self.original_db = main.db
        self.original_require_operator_auth = main.REQUIRE_OPERATOR_AUTH
        self.original_operator_keys = main.OPERATOR_API_KEYS
        self.original_require_idempotency = main.REQUIRE_IDEMPOTENCY_KEY
        self.original_require_agent_signature = main.REQUIRE_AGENT_SIGNATURE
        self.original_agent_shared_secret = main.AGENT_SHARED_SECRET

        main.db = InMemoryIdempotencyDb()
        main.REQUIRE_OPERATOR_AUTH = True
        main.OPERATOR_API_KEYS = {"test-operator-key"}
        main.REQUIRE_IDEMPOTENCY_KEY = True
        main.REQUIRE_AGENT_SIGNATURE = True
        main.AGENT_SHARED_SECRET = "unit-test-secret"

    def tearDown(self):
        main.db = self.original_db
        main.REQUIRE_OPERATOR_AUTH = self.original_require_operator_auth
        main.OPERATOR_API_KEYS = self.original_operator_keys
        main.REQUIRE_IDEMPOTENCY_KEY = self.original_require_idempotency
        main.REQUIRE_AGENT_SIGNATURE = self.original_require_agent_signature
        main.AGENT_SHARED_SECRET = self.original_agent_shared_secret

    def test_operator_key_guard(self):
        with self.assertRaises(HTTPException) as missing:
            main.require_operator_access(None)
        self.assertEqual(missing.exception.status_code, 401)

        with self.assertRaises(HTTPException) as invalid:
            main.require_operator_access("wrong-key")
        self.assertEqual(invalid.exception.status_code, 401)

        main.require_operator_access("test-operator-key")

    def test_idempotency_replay_returns_cached_response(self):
        calls = {"count": 0}

        async def action():
            calls["count"] += 1
            return {"tx_hash": "0x" + "1" * 64, "ok": True}

        payload = {"agent_id": "weather_agent", "amount_usdc": 0.1}
        first = asyncio.run(
            main._run_idempotent(
                key="idem-1",
                endpoint="/execute-payment",
                payload=payload,
                action=action,
            )
        )
        second = asyncio.run(
            main._run_idempotent(
                key="idem-1",
                endpoint="/execute-payment",
                payload=payload,
                action=action,
            )
        )

        self.assertEqual(first, second)
        self.assertEqual(calls["count"], 1)

    def test_idempotency_payload_mismatch_is_rejected(self):
        async def action():
            return {"ok": True}

        asyncio.run(
            main._run_idempotent(
                key="idem-2",
                endpoint="/execute-payment",
                payload={"amount_usdc": 0.1},
                action=action,
            )
        )

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                main._run_idempotent(
                    key="idem-2",
                    endpoint="/execute-payment",
                    payload={"amount_usdc": 0.2},
                    action=action,
                )
            )
        self.assertEqual(ctx.exception.status_code, 409)

    def test_agent_signature_verification(self):
        payload = {"agent_id": "weather_agent", "amount_usdc": 0.1, "recipient": "0x1111111111111111111111111111111111111111"}
        body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        now = str(int(time.time()))

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        scope = {
            "type": "http",
            "method": "POST",
            "path": "/execute-payment",
            "headers": [],
            "query_string": b"",
            "scheme": "http",
            "http_version": "1.1",
            "server": ("testserver", 80),
            "client": ("127.0.0.1", 12345),
        }
        request = Request(scope, receive)

        message = main._agent_signature_message(
            agent_id="weather_agent",
            timestamp=now,
            method="POST",
            path="/execute-payment",
            body_bytes=body,
        )
        signature = main._agent_signature_for_message(message)

        asyncio.run(
            main.require_agent_signature(
                request=request,
                x_agent_id="weather_agent",
                x_agent_timestamp=now,
                x_agent_signature=signature,
            )
        )

        with self.assertRaises(HTTPException) as invalid:
            asyncio.run(
                main.require_agent_signature(
                    request=request,
                    x_agent_id="weather_agent",
                    x_agent_timestamp=now,
                    x_agent_signature="bad-signature",
                )
            )
        self.assertEqual(invalid.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
