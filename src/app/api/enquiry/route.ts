import Anthropic from "@anthropic-ai/sdk";
import { sendEmail } from "@/lib/email";
import {
  DOUG_MODEL, DOUG_MAX_TOKENS, DOUG_SYSTEM_PROMPT,
  CAPTURE_ENQUIRY_TOOL, mergeCapture, formatEnquiryEmail,
  MAX_MESSAGES, MAX_MESSAGE_CHARS, MAX_BODY_BYTES, RATE_LIMIT_PER_MINUTE,
  type CapturedEnquiry,
} from "@/lib/doug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint powering Doug (the site chatbot). Widget POSTs the
// full conversation each turn; we call the model, apply any tool
// calls, and return { reply, complete }. Lead notification is a
// side-effect on the FIRST turn Doug flips ready_to_capture=true, so
// Thomas gets one email per new enquiry rather than one per turn.
//
// Design rails from the build brief:
//   - Model: claude-opus-4-8, NO temperature (rejects with 400).
//   - Structured lead via tool_use, prose via natural text output.
//   - Deny-by-default CORS with the live domains baked in.
//   - Rate limit per IP, hard caps on message/body size.
//   - Failure to email must NOT break the visitor's chat.

// Allowlisted origins. Baked in (not env-var driven) per the brief
// so a stale env doesn't take the widget down. Both apex + www + local
// dev; Vercel preview URLs match the *.vercel.app suffix check below.
const ALLOWED_ORIGINS = new Set<string>([
  "https://trdepledgegardeningandmaintenance.com",
  "https://www.trdepledgegardeningandmaintenance.com",
  "http://localhost:3000",
  "https://localhost:3000",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Vercel preview deploys land on *.vercel.app — allow so QA works
  // before promotion. Regex avoids matching arbitrary vercel-app-in-
  // subdomain nastiness.
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  };
  if (isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin!;
  return h;
}

// Simple in-memory rate limiter — resets on every serverless cold
// start, which is fine as a cost cap (each container instance still
// caps 30/min per IP). For a real DoS defence we'd wire Vercel KV.
const RATE_WINDOW_MS = 60_000;
const ipHits = new Map<string, number[]>();
function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, retryAfter: Math.ceil((hits[0] + RATE_WINDOW_MS - now) / 1000) };
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return { ok: true };
}

function clientIp(req: Request): string {
  // Vercel puts the real IP in x-forwarded-for (first hop). Fallback
  // to the socket address if not present (local dev).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

type IncomingMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Reject early if the caller isn't on the allowlist. Widget is
  // origin-locked by design; anything else is either malicious or a
  // misconfigured embed.
  if (!isAllowedOrigin(origin)) {
    return jsonError(403, "Origin not allowed", cors);
  }

  const ip = clientIp(req);
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Give it a minute." }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  // Body size ceiling before parsing — cheap protection against a
  // massive-JSON DoS. Content-Length isn't authoritative (clients
  // can lie) but it's a cheap first line of defence.
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (declaredLen > MAX_BODY_BYTES) {
    return jsonError(413, "Payload too large", cors);
  }

  let body: {
    messages?: unknown;
    capture?: unknown;
  };
  try { body = await req.json(); }
  catch { return jsonError(400, "Invalid JSON", cors); }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prevCapture: CapturedEnquiry = (body.capture && typeof body.capture === "object")
    ? (body.capture as CapturedEnquiry) : {};

  if (messages.length === 0) return jsonError(400, "messages required", cors);
  if (messages.length > MAX_MESSAGES) return jsonError(400, `Too many messages (>${MAX_MESSAGES})`, cors);

  const parsed: IncomingMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    if (content.length > MAX_MESSAGE_CHARS) return jsonError(400, "Message too long", cors);
    parsed.push({ role, content });
  }
  if (parsed.length === 0 || parsed[parsed.length - 1].role !== "user") {
    return jsonError(400, "Last message must be from user", cors);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[enquiry] ANTHROPIC_API_KEY not set");
    return jsonError(502, "Chat is temporarily unavailable.", cors);
  }

  const client = new Anthropic({ apiKey });

  let modelResp;
  try {
    // IMPORTANT: no `temperature` parameter — claude-opus-4-8 rejects
    // it with a 400 (documented in the build brief §2). Do not add.
    modelResp = await client.messages.create({
      model: DOUG_MODEL,
      max_tokens: DOUG_MAX_TOKENS,
      system: DOUG_SYSTEM_PROMPT,
      tools: [CAPTURE_ENQUIRY_TOOL],
      messages: parsed.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (err) {
    console.error("[enquiry] anthropic call failed", err);
    return jsonError(502, "Sorry — Doug's on smoko for a sec. Try again in a moment.", cors);
  }

  // Walk the model's response — collect text blocks for the reply,
  // and merge any tool_use blocks into the running capture.
  let reply = "";
  let newCapture: CapturedEnquiry = { ...prevCapture };
  let toolCalledThisTurn = false;
  for (const block of modelResp.content) {
    if (block.type === "text") {
      reply += block.text;
    } else if (block.type === "tool_use" && block.name === "capture_enquiry") {
      toolCalledThisTurn = true;
      const input = (block.input ?? {}) as Partial<CapturedEnquiry>;
      newCapture = mergeCapture(newCapture, input);
    }
  }

  // Only email Thomas the FIRST time Doug flips ready_to_capture=true
  // in this session. Compare against the previous capture state so
  // subsequent turns (which keep re-writing ready_to_capture=true)
  // don't spam him with duplicate notifications.
  const nowReady = newCapture.ready_to_capture === true;
  const wasReady = prevCapture.ready_to_capture === true;
  if (toolCalledThisTurn && nowReady && !wasReady) {
    const transcript = [
      ...parsed.map((m) => ({ role: m.role, text: m.content })),
      ...(reply.trim() ? [{ role: "assistant" as const, text: reply.trim() }] : []),
    ];
    const notifyTo = process.env.ENQUIRY_NOTIFY_EMAIL;
    if (notifyTo) {
      const { subject, html, text } = formatEnquiryEmail({ capture: newCapture, transcript });
      // Best-effort — swallow errors so a mail hiccup never breaks
      // the visitor's chat.
      sendEmail({ to: notifyTo, subject, html, text }).catch((e) =>
        console.error("[enquiry] notify email failed", e),
      );
    } else {
      console.warn("[enquiry] ENQUIRY_NOTIFY_EMAIL not set — capture NOT emailed", newCapture);
    }
  }

  // Empty reply is a red flag — model returned only a tool call with
  // no follow-up text. Substitute a warm fallback so the visitor
  // isn't left staring at silence.
  if (!reply.trim()) {
    reply = "Righto — I've passed that on to Thomas. He'll be in touch shortly to sort you out.";
  }

  return new Response(
    JSON.stringify({
      reply: reply.trim(),
      capture: newCapture,
      complete: newCapture.conversation_complete === true,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

function jsonError(status: number, message: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
