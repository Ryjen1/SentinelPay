import json
import os
import traceback
import uuid
import time
import hashlib
import hmac
from typing import Any, Dict, List

import httpx
from openai import OpenAI


class DemoAgent:
    def __init__(self, backend_url: str | None = None):
        self.backend_url = (backend_url or os.getenv("BACKEND_URL", "http://127.0.0.1:8000")).rstrip("/")
        self.operator_api_key = os.getenv("OPERATOR_API_KEY")
        self.agent_shared_secret = os.getenv("AGENT_SHARED_SECRET")
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        print(f"[demo-agent] OpenAI client initialized, model=gpt-4o-mini")

    def _signed_headers(self, *, method: str, path: str, payload: Dict[str, Any], agent_id: str) -> Dict[str, str]:
        headers: Dict[str, str] = {"Idempotency-Key": uuid.uuid4().hex}
        if self.operator_api_key:
            headers["X-Operator-Key"] = self.operator_api_key
        if self.agent_shared_secret:
            body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
            body_hash = hashlib.sha256(body.encode()).hexdigest()
            timestamp = str(int(time.time()))
            message = f"{agent_id}:{timestamp}:{method.upper()}:{path}:{body_hash}"
            signature = hmac.new(
                self.agent_shared_secret.encode(),
                message.encode(),
                hashlib.sha256,
            ).hexdigest()
            headers["X-Agent-Id"] = agent_id
            headers["X-Agent-Timestamp"] = timestamp
            headers["X-Agent-Signature"] = signature
        return headers

    def _execute_payment(self, *, agent_id: str, amount: float, recipient: str, reason: str) -> Dict[str, Any]:
        path = "/execute-payment"
        url = f"{self.backend_url}{path}"
        payload = {
            "agent_id": agent_id,
            "amount_usdc": amount,
            "recipient": recipient,
            "reason": reason,
        }
        print(f"[demo-agent] POST {url} payload={payload}")
        headers = self._signed_headers(method="POST", path=path, payload=payload, agent_id=agent_id)
        with httpx.Client(timeout=180) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

    def run(self, task: str, agent_id: str | None = None) -> Dict[str, Any]:
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is required to run the demo agent")

        system_prompt = (
            "You are an autonomous payment agent. "
            "Use the execute_payment tool when you decide a payment should be executed."
        )

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "execute_payment",
                    "description": "Execute a USDC payment from the SentinelVault",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "amount": {"type": "number"},
                            "recipient": {"type": "string"},
                            "reason": {"type": "string"},
                            "agent_id": {"type": "string"},
                        },
                        "required": ["amount", "recipient", "reason"],
                    },
                },
            }
        ]

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task},
        ]

        steps: List[str] = [f"Task received: {task}"]

        try:
            print("[demo-agent] sending initial prompt")
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                tools=tools,
                tool_choice="auto",
            )
            print(f"[demo-agent] OpenAI response received")

            choice = response.choices[0]
            tool_calls = choice.message.tool_calls or []
            steps.append("Model response received")

            if tool_calls:
                tool_call = tool_calls[0]
                steps.append("Tool call requested: execute_payment")
                args = json.loads(tool_call.function.arguments or "{}")
                amount = float(args.get("amount", 0))
                recipient = str(args.get("recipient", "")).strip()
                reason = str(args.get("reason", "")).strip()
                agent_id = str(
                    args.get("agent_id", agent_id or os.getenv("DEFAULT_AGENT_ID", "weather_agent"))
                ).strip()

                if amount <= 0:
                    raise RuntimeError("Model provided invalid amount for execute_payment")
                if not recipient:
                    raise RuntimeError("Model provided empty recipient for execute_payment")
                if not reason:
                    reason = "No reason provided"

                steps.append(
                    f"Requested payment: {amount} USDC to {recipient} for {reason}"
                )

                tx_result = self._execute_payment(
                    agent_id=agent_id,
                    amount=amount,
                    recipient=recipient,
                    reason=reason,
                )
                tx_hash = tx_result.get("tx_hash")

                messages.append(
                    {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": tool_call.id,
                                "type": "function",
                                "function": {
                                    "name": "execute_payment",
                                    "arguments": tool_call.function.arguments,
                                },
                            }
                        ],
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps({"tx_hash": tx_hash}),
                    }
                )

                final = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                )
                print(f"[demo-agent] OpenAI response received")
                final_text = final.choices[0].message.content or ""
                steps.append(f"Final response: {final_text}")

                print("[demo-agent] conversation complete")
                print(json.dumps({"messages": messages, "steps": steps, "tx_hash": tx_hash}, indent=2))
                return {
                    "tx_hash": tx_hash,
                    "steps": steps,
                    "response": final_text,
                }

            final_text = choice.message.content or ""
            steps.append("No tool call made by model")
            print(json.dumps({"messages": messages, "steps": steps, "response": final_text}, indent=2))
            return {"tx_hash": None, "steps": steps, "response": final_text}
        except Exception as e:
            print(f"[demo-agent] ERROR: {type(e).__name__}: {e}")
            print(traceback.format_exc())
            raise
