// Doug — the galah mascot who "supervises Thomas" on the marketing
// site. Duplicates the TAJJPI "Jordy" enquiry-bot pattern per the
// build brief in /Downloads/dougenquirybotbuildbrief.md.
//
// Everything Doug-specific lives here so the route handler + widget
// stay generic scaffolding. Persona + capture-tool + email template.

export const DOUG_MODEL = "claude-opus-4-8";
export const DOUG_MAX_TOKENS = 2048;

// Hard message caps — brief §5. Turn cap of ~40 stops runaway
// sessions from ballooning the model bill; per-message and total-body
// caps sanity-check the payload before it even hits the SDK.
export const MAX_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_BODY_BYTES = 100 * 1024;

// Rate limit (accepted POSTs per IP per minute, per §5).
export const RATE_LIMIT_PER_MINUTE = 30;

// System prompt — persona one-liner + explicit rails from the brief.
// Kept in ONE string so behaviour changes are single-edit.
export const DOUG_SYSTEM_PROMPT = `You are Doug, the cheeky galah mascot who "supervises" Thomas Depledge at T.R. Depledge Gardening & Maintenance (based in Wallaroo, SA — serving the entire Yorke Peninsula, including Kadina and Moonta). You're warm, funny, broad-Aussie, and genuinely useful. Locals-friendly, not corporate.

Your job on the website:
- Greet warmly and ask what the visitor needs help with.
- Get curious about the JOB: what work, property type, rough size, location/suburb, one-off vs ongoing, timeframe/urgency.
- Collect a NAME and a way to contact them (email OR phone) and agree a next step (Thomas will follow up to quote/schedule).

Hard rules:
- NEVER quote prices, promise dates, or invent details. You qualify and route — Thomas does the quoting.
- NEVER turn business away or pre-judge a job as too small/big or "not your area." Capture it and let Thomas decide fit.
- Keep replies SHORT and human (2–4 sentences), one question at a time.
- Don't spam callouts to call Thomas directly — you're the front door; capture the enquiry.

Trust cues you can weave in when it fits: Local & Reliable, Police Checked, Fully Insured, NDIS Approved, and a team that actually turns up.

Services T.R. Depledge does: lawn mowing, hedge & shrub trimming, pruning & tidy-ups, planting & garden beds, green-waste clearance, ongoing scheduled maintenance, and NDIS / aged-care garden care.

When you have enough to capture (name + contact + a rough sense of the job), call the capture_enquiry tool with what you know. Only include fields you're actually sure of — leave the rest blank. You can call it multiple times as more details come out; each call updates the same record.

When the visitor has been handed off ("Thomas will call you back"), set conversation_complete = true on the final tool call.`;

// Tool schema — capture_enquiry. Per brief: on enrich, only WRITE
// fields present. Anthropic's tool_use returns whatever properties
// the model chose to fill; the route handler enforces the "don't
// overwrite with null" rule on merge.
export const CAPTURE_ENQUIRY_TOOL = {
  name: "capture_enquiry",
  description:
    "Capture the visitor's enquiry details so Thomas can follow up. Call this as soon as you know something concrete — name, contact, or job details — and again as more comes out. Only include fields you're confident of; omit the rest.",
  input_schema: {
    type: "object" as const,
    properties: {
      contact_name:     { type: "string", description: "Visitor's first name or full name." },
      email:            { type: "string", description: "Visitor's email address, if given." },
      phone:            { type: "string", description: "Visitor's phone number, if given. Australian mobile or landline." },
      suburb:           { type: "string", description: "Town or suburb the job is in (e.g. Wallaroo, Kadina, Moonta, Port Hughes)." },
      service_type:     { type: "string", description: "What work they need (e.g. mowing, hedge trim, garden tidy-up, ongoing maintenance)." },
      property_type:    { type: "string", enum: ["home", "commercial", "ndis_aged_care", "strata"], description: "Type of property." },
      job_size:         { type: "string", enum: ["small_tidy", "half_day", "full_day", "ongoing"], description: "Rough size / scope." },
      job_description:  { type: "string", description: "Free-text description of the job." },
      timeframe:        { type: "string", enum: ["asap", "this_month", "flexible"], description: "How urgent." },
      ndis_client:      { type: "boolean", description: "True if this is an NDIS or aged-care client." },
      ready_to_capture: { type: "boolean", description: "True once you've got enough (name + contact + rough job details) for Thomas to follow up." },
      conversation_complete: { type: "boolean", description: "True once the handoff is done and the chat has naturally ended." },
    },
    required: [],
  },
};

export type CapturedEnquiry = {
  contact_name?: string;
  email?: string;
  phone?: string;
  suburb?: string;
  service_type?: string;
  property_type?: "home" | "commercial" | "ndis_aged_care" | "strata";
  job_size?: "small_tidy" | "half_day" | "full_day" | "ongoing";
  job_description?: string;
  timeframe?: "asap" | "this_month" | "flexible";
  ndis_client?: boolean;
  ready_to_capture?: boolean;
  conversation_complete?: boolean;
};

// Merge a new tool-call payload into the running capture. Explicit
// rule (brief §4): NEVER overwrite a captured value with null/undefined.
// The model sometimes re-calls the tool with only the new field it
// just learned — merging blindly would blank everything else.
export function mergeCapture(
  prev: CapturedEnquiry,
  next: Partial<CapturedEnquiry>,
): CapturedEnquiry {
  const merged: CapturedEnquiry = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    (merged as Record<string, unknown>)[k] = v;
  }
  return merged;
}

// Human-readable subject + body for the notification email. Body is
// plain-text so it renders anywhere; the field block goes first (what
// Thomas actually needs), transcript underneath as a scrollable
// reference.
export function formatEnquiryEmail(args: {
  capture: CapturedEnquiry;
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
}): { subject: string; text: string; html: string } {
  const c = args.capture;
  const name    = c.contact_name?.trim() || "(no name yet)";
  const suburb  = c.suburb?.trim()       || "(no suburb yet)";
  const subject = `New website enquiry — ${name}, ${suburb}`;

  const fieldLines: string[] = [
    `Name:         ${name}`,
    `Phone:        ${c.phone ?? "—"}`,
    `Email:        ${c.email ?? "—"}`,
    `Suburb:       ${suburb}`,
    `Service:      ${c.service_type ?? "—"}`,
    `Property:     ${c.property_type ?? "—"}`,
    `Size:         ${c.job_size ?? "—"}`,
    `Timeframe:    ${c.timeframe ?? "—"}`,
    `NDIS client:  ${c.ndis_client ? "yes" : "no / unknown"}`,
    `Description:  ${c.job_description ?? "—"}`,
  ];

  const transcriptLines = args.transcript.map((m) =>
    `${m.role === "user" ? "Visitor" : "Doug"}: ${m.text}`,
  );

  const text = [
    "Doug just captured a new enquiry from the website.",
    "",
    ...fieldLines,
    "",
    "--- Transcript ---",
    ...transcriptLines,
  ].join("\n");

  const html = `
    <p><strong>Doug just captured a new enquiry from the website.</strong></p>
    <table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">
      ${fieldLines.map((line) => {
        const [label, ...rest] = line.split(":");
        const val = rest.join(":").trim();
        return `<tr>
          <td style="padding:4px 12px 4px 0;color:#666;font-weight:600">${label}</td>
          <td style="padding:4px 0;color:#0F1B2D">${escapeHtml(val)}</td>
        </tr>`;
      }).join("")}
    </table>
    <h3 style="margin:20px 0 8px;font-family:Arial,sans-serif;color:#0F1B2D">Transcript</h3>
    <div style="background:#F5F5F5;padding:12px;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;white-space:pre-wrap">${escapeHtml(transcriptLines.join("\n"))}</div>
  `;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
