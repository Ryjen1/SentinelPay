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

  let body: { task?: string; agent_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const task = (body.task || "").trim();
  if (!task) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }
  const agentId = (body.agent_id || process.env.NEXT_PUBLIC_AGENT_ID || "weather_agent").trim();

  const payload = { task, agent_id: agentId };
  const payloadText = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": randomUUID().replace(/-/g, ""),
  };

  const bodyData = body as any;

  // Forward Wallet Signature headers (Interactive Fallback)
  const xWalletSig = request.headers.get("X-Wallet-Signature") || bodyData.wallet_signature;
  const xWalletTs = request.headers.get("X-Wallet-Timestamp") || bodyData.wallet_timestamp;
  const xWalletAgentId = request.headers.get("X-Wallet-Agent-Id") || agentId;
  const xWalletAddrHeader = request.headers.get("X-Wallet-Address") || bodyData.wallet_address;

  if (xWalletSig) headers["X-Wallet-Signature"] = xWalletSig;
  if (xWalletTs) headers["X-Wallet-Timestamp"] = xWalletTs;
  if (xWalletAgentId) headers["X-Wallet-Agent-Id"] = xWalletAgentId;
  if (xWalletAddrHeader) headers["X-Wallet-Address"] = xWalletAddrHeader;

  // Forward Delegation headers
  const xDelegationSig = request.headers.get("X-Delegation-Signature");
  const xDelegationData = request.headers.get("X-Delegation-Data");
  const xWalletAddr = request.headers.get("X-Wallet-Address") || bodyData.wallet_address;

  if (xDelegationSig) headers["X-Delegation-Signature"] = xDelegationSig;
  if (xDelegationData) headers["X-Delegation-Data"] = xDelegationData;
  if (xWalletAddr) headers["X-Wallet-Address"] = xWalletAddr;

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
      path: "/agent-execute",
      body: payloadText,
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBaseUrl}/agent-execute`, {
      method: "POST",
      headers,
      body: payloadText,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Unable to reach backend /agent-execute",
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
