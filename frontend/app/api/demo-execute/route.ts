import { randomUUID, createHash, createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function buildAgentSignature({
  sharedSecret,
  agentId,
  timestamp,
  method,
  path,
  body,
}: {
  sharedSecret: string;
  agentId: string;
  timestamp: string;
  method: string;
  path: string;
  body: string;
}) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = `${agentId}:${timestamp}:${method.toUpperCase()}:${path}:${bodyHash}`;
  return createHmac("sha256", sharedSecret).update(message).digest("hex");
}

export async function POST(request: NextRequest) {
  const backendBaseUrl = (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  let body: {
    agent_id?: string;
    recipient?: string;
    amount_usdc?: number;
    reason?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const agentId = (body.agent_id || process.env.NEXT_PUBLIC_AGENT_ID || "weather_agent").trim();
  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const payload: {
    agent_id: string;
    recipient?: string;
    amount_usdc?: number;
    reason?: string;
  } = { agent_id: agentId };
  if (typeof body.recipient === "string" && body.recipient.trim()) {
    payload.recipient = body.recipient.trim();
  }
  if (typeof body.amount_usdc === "number" && Number.isFinite(body.amount_usdc)) {
    payload.amount_usdc = body.amount_usdc;
  }
  if (typeof body.reason === "string" && body.reason.trim()) {
    payload.reason = body.reason.trim();
  }
  const payloadText = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": randomUUID().replace(/-/g, ""),
  };

  const operatorApiKey = process.env.OPERATOR_API_KEY;
  if (operatorApiKey) {
    headers["X-Operator-Key"] = operatorApiKey;
  }

  const sharedSecret = process.env.AGENT_SHARED_SECRET;
  if (sharedSecret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    headers["X-Agent-Id"] = agentId;
    headers["X-Agent-Timestamp"] = timestamp;
    headers["X-Agent-Signature"] = buildAgentSignature({
      sharedSecret,
      agentId,
      timestamp,
      method: "POST",
      path: "/execute-demo",
      body: payloadText,
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBaseUrl}/execute-demo`, {
      method: "POST",
      headers,
      body: payloadText,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Unable to reach backend /execute-demo",
        detail: message,
        backend_base_url: backendBaseUrl,
      },
      { status: 502 }
    );
  }

  const text = await upstream.text();
  let parsed: unknown = { raw: text };
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // no-op, keep raw text
  }

  return NextResponse.json(parsed, { status: upstream.status });
}
