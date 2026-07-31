import Anthropic from "@anthropic-ai/sdk";
import type {
  Message as AnthropicMessage,
  MessageParam,
  ToolUseBlock,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { sendEmail } from "@/lib/email";
import { getServiceClient } from "@/lib/supabase";
import {
  DOUG_MODEL, DOUG_MAX_TOKENS, DOUG_SYSTEM_PROMPT,
  CAPTURE_ENQUIRY_TOOL, mergeCapture, formatEnquiryEmail,
  buildEnquiryRow, buildJobRow, missingCaptureFields, isCaptureComplete,
  MAX_MESSAGES, MAX_MESSAGE_CHARS, MAX_BODY_BYTES, RATE_LIMIT_PER_MINUTE,
  type CapturedEnquiry,
} from "@/lib/doug";
import { HIRE_TOOLS, dougSystemPrompt, isHirePagePath, isHireToolName } from "@/lib/hire/doug";
import { runHireTool, type HireHandoff } from "@/lib/hire/doug-tools";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL
  ?? "https://trdepledgegardeningandmaintenance.com";

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
    page?: unknown;
  };
  try { body = await req.json(); }
  catch { return jsonError(400, "Invalid JSON", cors); }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prevCapture: CapturedEnquiry = (body.capture && typeof body.capture === "object")
    ? (body.capture as CapturedEnquiry) : {};

  // Which page the visitor is reading. Doug behaves differently behind the
  // hire counter than he does on the gardening site — see dougSystemPrompt.
  // Untrusted and cosmetic: the worst a forged value can do is put him in
  // the wrong mode, and both modes only reach read-only tools.
  const page = typeof body.page === "string" ? body.page.slice(0, 300) : "";
  const onHirePage = isHirePagePath(page);

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

  // Agentic tool-use loop. When Claude 4-family calls a tool, it
  // sets stop_reason='tool_use' and expects a tool_result before
  // producing its NEXT visitor-facing text. Some rounds emit text
  // alongside the tool call (an acknowledgement like "Nice one,
  // Tristan Graham.") and expect us to continue so they can add
  // the next question in the follow-up round.
  //
  // We solve both known failure modes by tracking the LAST round's
  // text as the reply (not accumulating across rounds):
  //   - "Freeze" case  — round 1 "Nice one." → round 2 "What's the
  //                      job?" → show round 2.
  //   - "Double-say"   — round 1 "What's your name?" → round 2
  //                      "What's your name?" (repeat) → show once.
  //
  // Loop stops when the model returns a non-tool_use stop_reason
  // (i.e. it's done for this turn) or MAX_TOOL_ROUNDS is reached.
  const conversation: MessageParam[] = parsed.map((m) => ({ role: m.role, content: m.content }));
  let reply = "";
  let newCapture: CapturedEnquiry = { ...prevCapture };
  let toolCalledThisTurn = false;
  // Set when Doug fills the hire booking form in for the visitor. Returned
  // to the widget, which dispatches it to the page — it selects the tool
  // and dates. It is NOT a booking: the customer still submits the form.
  let handoff: HireHandoff | null = null;

  // Six rather than four: a hire answer legitimately chains list_equipment
  // → check_availability → quote_hire → prefill_booking_form, and cutting
  // it short would leave the visitor with a quote and no form.
  const MAX_TOOL_ROUNDS = 6;

  const system = dougSystemPrompt(DOUG_SYSTEM_PROMPT, { onHirePage });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // IMPORTANT: no `temperature` parameter — claude-opus-4-8 rejects
      // it with a 400 (documented in the build brief §2). Do not add.
      const modelResp: AnthropicMessage = await client.messages.create({
        model: DOUG_MODEL,
        max_tokens: DOUG_MAX_TOKENS,
        system,
        // The hire tools are offered on every page. They're read-only and
        // the prompt decides whether he should be reaching for them — a
        // visitor on /contact who asks "do you hire out a mixer?" deserves
        // a real answer rather than a guess.
        tools: [CAPTURE_ENQUIRY_TOOL, ...HIRE_TOOLS],
        messages: conversation,
      });

      // Collect text + tool uses from THIS round only.
      let roundText = "";
      const toolUses: ToolUseBlock[] = [];
      for (const block of modelResp.content) {
        if (block.type === "text") {
          roundText += block.text;
        } else if (block.type === "tool_use") {
          toolUses.push(block);
          if (block.name === "capture_enquiry") {
            toolCalledThisTurn = true;
            const input = (block.input ?? {}) as Partial<CapturedEnquiry>;
            newCapture = mergeCapture(newCapture, input);
          }
        }
      }

      // Track the latest round's text as the running reply. If we
      // continue the loop and the next round produces more text,
      // that later text wins (usually because it contains the next
      // question).
      if (roundText.trim()) reply = roundText;

      // If the model isn't asking for a tool result, the turn is
      // complete. Bail out with whatever `reply` currently holds.
      if (modelResp.stop_reason !== "tool_use" || toolUses.length === 0) break;

      // Model called a tool and wants the result back.
      //
      // capture_enquiry is a write into our own state, so a synthetic
      // {ok:true} is the whole answer. The hire tools genuinely look
      // something up — that result is the only place Doug is allowed to
      // get a rate, a bond or a date from, so it has to be real.
      conversation.push({ role: "assistant", content: modelResp.content });
      const toolResults: ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tu): Promise<ToolResultBlockParam> => {
          if (!isHireToolName(tu.name)) {
            return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ ok: true }) };
          }
          const outcome = await runHireTool(
            getServiceClient(),
            tu.name,
            (tu.input ?? {}) as Record<string, unknown>,
            { onHirePage },
          );
          if (outcome.handoff) handoff = outcome.handoff;
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(outcome.result),
          };
        }),
      );
      conversation.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    console.error("[enquiry] anthropic call failed", err);
    return jsonError(502, "Sorry — Doug's on smoko for a sec. Try again in a moment.", cors);
  }

  // SERVER-SIDE guard: only persist when the capture actually has
  // every required field with a non-empty value. The model can (and
  // has) set ready_to_capture=true prematurely — the app is the
  // final authority on whether an enquiry is complete enough to
  // insert. If the model claims ready_to_capture=true but fields
  // are missing, we ignore the flag, log the discrepancy, and let
  // the conversation continue.
  const missing = missingCaptureFields(newCapture);
  const complete = isCaptureComplete(newCapture);
  const modelSaysReady = newCapture.ready_to_capture === true;
  if (modelSaysReady && !complete) {
    console.warn("[enquiry] model set ready_to_capture=true but fields missing:", missing);
  }
  const nowReady = modelSaysReady && complete;
  const alreadySaved = !!newCapture.enquiry_id;

  if (toolCalledThisTurn && nowReady) {
    const transcript = [
      ...parsed.map((m) => ({ role: m.role, text: m.content })),
      ...(reply.trim() ? [{ role: "assistant" as const, text: reply.trim() }] : []),
    ];

    if (!alreadySaved) {
      // First capture — insert BOTH the enquiries row AND a jobs row
      // with status='pending_review' so Thomas can review + quote
      // from /admin/jobs?status=pending_review directly. Enquiry
      // status is 'converted' (already turned into a job) and its
      // converted_to_job_id points at the created job for audit.
      const supabase = getServiceClient();
      let enquiryId: string | null = null;
      let jobId: string | null = null;

      if (supabase) {
        // 1. Insert the job first — enquiries.converted_to_job_id
        //    needs its id.
        const jobRow = buildJobRow(newCapture);
        const { data: insertedJob, error: jobErr } = await supabase
          .from("jobs")
          .insert(jobRow)
          .select("id")
          .single();
        if (jobErr) {
          console.error("[enquiry] job insert failed", jobErr);
        } else if (insertedJob) {
          jobId = insertedJob.id as string;
        }

        // 2. Insert the enquiry — if the job insert worked, mark it
        //    converted + link the two. If the job insert failed, drop
        //    the enquiry in as 'new' so Thomas can still see the
        //    contact details in /admin/enquiries.
        const enquiryRow = buildEnquiryRow(
          newCapture,
          transcript,
          jobId ? "converted" : "new",
        );
        const enquiryInsert = jobId
          ? { ...enquiryRow, converted_to_job_id: jobId }
          : enquiryRow;
        const { data: insertedEnq, error: enqErr } = await supabase
          .from("enquiries")
          .insert(enquiryInsert)
          .select("id")
          .single();
        if (enqErr) {
          console.error("[enquiry] enquiry insert failed", enqErr);
        } else if (insertedEnq) {
          enquiryId = insertedEnq.id as string;
          newCapture.enquiry_id = enquiryId;
        }
      } else {
        console.warn("[enquiry] Supabase not configured — Doug capture NOT persisted");
      }

      // Fire notification email even if the inserts failed — Thomas
      // still gets the lead; he can create rows manually if needed.
      // Prefer linking to the job (the primary review destination)
      // when we have one; fall back to the enquiry otherwise.
      const notifyTo = process.env.ENQUIRY_NOTIFY_EMAIL;
      if (notifyTo) {
        const { subject, html, text } = formatEnquiryEmail({
          capture: newCapture,
          transcript,
          jobId: jobId ?? undefined,
          enquiryId: enquiryId ?? undefined,
          appBaseUrl: APP_BASE_URL,
        });
        sendEmail({ to: notifyTo, subject, html, text }).catch((e) =>
          console.error("[enquiry] notify email failed", e),
        );
      } else {
        console.warn("[enquiry] ENQUIRY_NOTIFY_EMAIL not set — capture NOT emailed", newCapture);
      }
    } else {
      // Subsequent capture — update the existing enquiry row so
      // late-added fields (extra job details, corrected phone)
      // reach Thomas. Never touch the JOB row — Thomas may already
      // have started scheduling it. Best-effort; no notification
      // re-fires.
      const supabase = getServiceClient();
      if (supabase && newCapture.enquiry_id) {
        const row = buildEnquiryRow(newCapture, transcript);
        const { status: _s, ...updateFields } = row;
        const { error } = await supabase
          .from("enquiries")
          .update(updateFields)
          .eq("id", newCapture.enquiry_id);
        if (error) console.error("[enquiry] follow-up update failed", error);
      }
    }
  }

  // Empty reply is still possible in edge cases (agentic loop hit
  // MAX_TOOL_ROUNDS, or the model returned nothing at all). Pick a
  // fallback that DOESN'T falsely close the intake — instead, nudge
  // Doug to keep going by asking for whatever's still missing.
  if (!reply.trim()) {
    if (onHirePage) {
      // The intake nudge below would be nonsense here — nobody hiring a
      // mixer is waiting to be asked for their postcode. Say nothing we'd
      // have to walk back, and put the next move in their hands.
      reply = handoff
        ? "Righto — I've filled the form in below with those dates. Pop your name and number in and send it through."
        : "Sorry, I lost my thread there. What were you after — and roughly when do you need it?";
    } else if (missing.length > 0) {
      const nextField = HUMAN_FIELD_NAMES[missing[0]] ?? missing[0];
      reply = `Righto — got that. What's your ${nextField}?`;
    } else {
      reply = "Righto — Thomas has all your details and he'll be in touch shortly. Cheers!";
    }
  }

  return new Response(
    JSON.stringify({
      reply: reply.trim(),
      capture: newCapture,
      // Present only when Doug filled the hire booking form in. The widget
      // forwards it to the page as an event; the page selects the tool and
      // the dates and scrolls the customer to the form.
      ...(handoff ? { handoff } : {}),
      // `complete` is what the widget uses to decide whether to
      // still accept input. Only claim complete when the app-side
      // validation agrees.
      complete: nowReady && newCapture.conversation_complete === true,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

// Human-friendly labels for the empty-reply fallback so Doug's
// synthesised nudge sounds natural ("What's your last name?" instead
// of "What's your last_name?").
const HUMAN_FIELD_NAMES: Record<string, string> = {
  first_name:   "first name",
  last_name:    "last name",
  email:        "email address",
  phone:        "phone number",
  address:      "street address (number and street name)",
  suburb:       "suburb",
  postcode:     "postcode",
  service_type: "service type — mowing, hedges, tidy-up?",
  client_type:  "client type — Private, NDIS, Aged Care, or Commercial?",
  frequency:    "frequency — one-off or ongoing (weekly, fortnightly, monthly)?",
  message:      "a quick description of the job",
};

function jsonError(status: number, message: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
