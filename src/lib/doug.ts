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
// Field list mirrors the /contact form so Doug enquiries flow into
// the same admin queue with the same shape.
export const DOUG_SYSTEM_PROMPT = `You are Doug, the cheeky galah mascot who "supervises" Thomas Depledge at T.R. Depledge Gardening & Maintenance (based in Wallaroo, SA — serving the entire Yorke Peninsula, including Kadina and Moonta). You're warm, funny, broad-Aussie, and genuinely useful. Locals-friendly, not corporate.

# What you're doing here

Every conversation has ONE job: capture a complete enquiry so Thomas can quote and follow up. You are NOT a general-purpose chatbot. You are a lead-capture front door for a small business.

# The 8 fields you MUST collect before finishing

You must collect ALL EIGHT of these before setting ready_to_capture = true. There are NO exceptions — every field is required. This matches the website's contact form, which enforces the same requirements:

  1. **first_name**    — Their first name.
  2. **last_name**     — Their last name / surname.
  3. **email**         — Their email address.
  4. **phone**         — An Australian phone number (mobile or landline).
  5. **suburb**        — Town or suburb the job is at (e.g. Wallaroo, Kadina, Moonta, Port Hughes).
  6. **service_type**  — What work they need (mowing, hedge trim, tidy-up, ongoing maintenance, etc.).
  7. **client_type**   — Private, NDIS, Aged Care, or Commercial. If you don't know for sure, ASK ("Are you a private client, an NDIS participant, on an aged-care package, or a business?").
  8. **message**       — A rough description of the job (property size, condition, timeframe).

# The collection sequence

Follow this loop until every required field is captured:
  a. Greet + learn about the job (what and where).
  b. When you've learned something concrete, call capture_enquiry with what you know.
  c. Look at what's still MISSING from the 8 required fields.
  d. Ask for the next missing field in a natural way, ONE question at a time.
  e. Loop.

# You cannot finish without all 8 fields

Do NOT set ready_to_capture = true with ANY missing field. The visitor cannot submit an incomplete enquiry — the website's own form blocks incomplete submissions, and Doug enforces the same rule. If they say "that's it" but you're still missing a field, don't just accept it — say something warm like "One last thing — [missing field]?".

If they truly refuse to give a required field (they push back after you've asked twice), be honest: "No worries, but Thomas needs [that field] to be able to help you. Happy to keep going once you can share it — or feel free to give him a bell direct on 0474 844 204." Do NOT set ready_to_capture = true; leave the conversation there.

# Hard rules

- NEVER quote prices, promise dates, or invent details. Thomas does the quoting.
- NEVER turn business away or pre-judge a job as too small/big or "not your area." Capture it and let Thomas decide.
- Keep replies SHORT and human (2–4 sentences), one question at a time.
- Don't tell people to just call Thomas directly — you're the intake process; capture the enquiry.
- If they give a single name ("John"), ask for their last name in the next reply.
- Never assume the enquiry is complete just because they said "yeah that's it." Check the 7 fields against what you've captured — if any are missing, ask for them.

# Trust cues (weave in when it fits)

Local & Reliable, Police Checked, Fully Insured, NDIS Approved, a team that actually turns up.

# Services T.R. Depledge does

Lawn mowing, hedge & shrub trimming, pruning & tidy-ups, planting & garden beds, green-waste clearance, ongoing scheduled maintenance, and NDIS / aged-care garden care.

# Tool call rhythm

Call capture_enquiry EARLY and OFTEN — every time you learn a new field, call it with just the new field. The app merges each call into a single record and skips blanks, so partial calls are safe. When you finally have all 7 fields, call one last time with ready_to_capture = true.

When the visitor's been handed off ("Thomas will be in touch"), set conversation_complete = true on the final tool call.`;

// Tool schema — capture_enquiry. Mirrors the enquiries-table columns
// used by the /contact form so Doug leads land in the same admin
// review queue with the same shape.
export const CAPTURE_ENQUIRY_TOOL = {
  name: "capture_enquiry",
  description:
    "Capture the visitor's enquiry details so Thomas can follow up. Call this as soon as you know something concrete — a name, contact, or job details — and again as more comes out. Only include fields you're confident of; leave others blank. The app merges each call into the same record and skips blank fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      first_name:       { type: "string", description: "Visitor's first name." },
      last_name:        { type: "string", description: "Visitor's last name / surname. Ask if they only gave one name — the admin CRM needs both." },
      email:            { type: "string", description: "Visitor's email address." },
      phone:            { type: "string", description: "Visitor's phone number. Australian mobile or landline (e.g. 04XX XXX XXX)." },
      suburb:           { type: "string", description: "Town or suburb the job is in (e.g. Wallaroo, Kadina, Moonta, Port Hughes)." },
      service_type:     { type: "string", description: "What work they need. Free text (e.g. \"lawn mowing\", \"hedge trim\", \"garden tidy-up\", \"ongoing fortnightly maintenance\")." },
      client_type:      { type: "string", enum: ["Private", "NDIS", "Aged Care", "Commercial"], description: "Client category. Default is 'Private'. Pick 'NDIS' or 'Aged Care' if they mention NDIS support, aged-care package, plan manager, etc. 'Commercial' for businesses/strata." },
      message:          { type: "string", description: "Free-text description of the job — property size, condition, timeframe, anything Thomas needs to know to quote." },
      ready_to_capture: { type: "boolean", description: "True once you've got name + email OR phone + suburb + service_type + message. This is the signal that Thomas should be notified." },
      conversation_complete: { type: "boolean", description: "True once the handoff is done and the chat has naturally ended." },
    },
    required: [],
  },
};

export type CapturedEnquiry = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  suburb?: string;
  service_type?: string;
  client_type?: "Private" | "NDIS" | "Aged Care" | "Commercial";
  message?: string;
  ready_to_capture?: boolean;
  conversation_complete?: boolean;
  // App-set (not model-set) — the id of the enquiries row Doug
  // inserted for this conversation. Presence signals "already
  // saved to DB, don't insert a duplicate on the next tool call."
  enquiry_id?: string;
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

// Format the full transcript as a plain string. Also stored in the
// enquiries row's `notes` column so admin can review the whole
// conversation later.
export function formatTranscript(
  transcript: Array<{ role: "user" | "assistant"; text: string }>,
): string {
  return transcript
    .map((m) => `${m.role === "user" ? "Visitor" : "Doug"}: ${m.text}`)
    .join("\n\n");
}

function fullName(c: CapturedEnquiry): string {
  const first = c.first_name?.trim() ?? "";
  const last  = c.last_name?.trim()  ?? "";
  const both = `${first} ${last}`.trim();
  return both || "(no name yet)";
}

// Human-readable subject + body for the notification email.
// Prefers linking to the JOB row (Thomas's review destination); falls
// back to the enquiry if the job insert failed.
export function formatEnquiryEmail(args: {
  capture: CapturedEnquiry;
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
  jobId?: string;
  enquiryId?: string;
  appBaseUrl?: string;
}): { subject: string; text: string; html: string } {
  const c = args.capture;
  const name    = fullName(c);
  const suburb  = c.suburb?.trim() || "(no suburb yet)";
  const subject = `New Doug enquiry — ${name}, ${suburb}`;

  const fieldLines: string[] = [
    `Name:         ${name}`,
    `Phone:        ${c.phone ?? "—"}`,
    `Email:        ${c.email ?? "—"}`,
    `Suburb:       ${suburb}`,
    `Service:      ${c.service_type ?? "—"}`,
    `Client type:  ${c.client_type ?? "Private"}`,
    `Job details:  ${c.message ?? "—"}`,
  ];

  const transcriptText = formatTranscript(args.transcript);
  const base = args.appBaseUrl?.replace(/\/$/, "") ?? "";
  const jobUrl     = args.jobId     && base ? `${base}/admin/jobs/${args.jobId}` : null;
  const enquiryUrl = args.enquiryId && base ? `${base}/admin/enquiries/${args.enquiryId}` : null;
  const primaryUrl = jobUrl ?? enquiryUrl;
  const primaryLabel = jobUrl ? "Review job →" : "Review enquiry →";

  const text = [
    "Doug just captured a new enquiry from the website. It's already been created as a pending-review job.",
    ...(primaryUrl ? ["", `${primaryLabel.replace(/\s*→$/, "")}: ${primaryUrl}`] : []),
    ...(enquiryUrl && jobUrl ? [`Enquiry source: ${enquiryUrl}`] : []),
    "",
    ...fieldLines,
    "",
    "--- Transcript ---",
    transcriptText,
  ].join("\n");

  const html = `
    <p><strong>Doug just captured a new enquiry from the website.</strong>${jobUrl ? " It's already been created as a pending-review job." : ""}</p>
    ${primaryUrl ? `<p style="margin:12px 0">
      <a href="${primaryUrl}" style="background:#0F1B2D;color:#D0FF59;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:800;font-family:Arial,sans-serif;display:inline-block">
        ${primaryLabel}
      </a>
    </p>` : ""}
    ${enquiryUrl && jobUrl ? `<p style="font-size:12px;color:#666"><a href="${enquiryUrl}" style="color:#0F1B2D">Enquiry source</a> · original transcript</p>` : ""}
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
    <div style="background:#F5F5F5;padding:12px;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;white-space:pre-wrap">${escapeHtml(transcriptText)}</div>
  `;

  return { subject, text, html };
}

// Build the row we insert into `enquiries` when Doug flips
// ready_to_capture. Doug's system prompt enforces that every field is
// present before ready_to_capture is set, so we trust the values as
// non-empty; the trimmed?? fallbacks are defence-in-depth in case
// the model slips.
export function buildEnquiryRow(
  c: CapturedEnquiry,
  transcript: Array<{ role: "user" | "assistant"; text: string }>,
  extraStatus: "new" | "converted" = "new",
): {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  suburb: string;
  service_type: string;
  client_type: string | null;
  message: string | null;
  status: "new" | "converted";
  notes: string;
} {
  return {
    first_name:   c.first_name?.trim() || "(via Doug)",
    last_name:    c.last_name?.trim()  || "(via Doug)",
    email:        c.email?.trim() || "no-email@doug-enquiry.local",
    phone:        c.phone?.trim() || null,
    suburb:       c.suburb?.trim() || "(unknown)",
    service_type: c.service_type?.trim() || "(unspecified)",
    client_type:  c.client_type ?? "Private",
    message:      c.message?.trim() || null,
    status:       extraStatus,
    notes: `Captured via Doug chatbot.\n\n--- Transcript ---\n${formatTranscript(transcript)}`,
  };
}

// jobs.client_type is CHECK-constrained to Private / NDIS / Aged Care
// — no Commercial. Follow the same convention as ensureRecurringJobForClient:
// fall Commercial back to Private so the DB write succeeds. Thomas
// can retype it in the edit form if needed.
function jobClientType(dougType?: string): "Private" | "NDIS" | "Aged Care" {
  switch (dougType) {
    case "NDIS":      return "NDIS";
    case "Aged Care": return "Aged Care";
    default:          return "Private";
  }
}

// The system JobNote author for records Doug (not a human) creates.
// The Notes UI only uses author_name for display; author_id is
// stored for auditing purposes.
const DOUG_SYSTEM_NOTE_AUTHOR = {
  author_id:   "00000000-0000-0000-0000-000000000000",
  author_name: "Doug (chatbot)",
};

// Build the jobs row Doug inserts alongside the enquiries row. Status
// is 'pending_review' so it lands in the admin "For review" tab where
// Thomas can quote / schedule / cancel from.
export function buildJobRow(c: CapturedEnquiry): {
  client_name: string;
  client_type: "Private" | "NDIS" | "Aged Care";
  suburb: string | null;
  description: string;
  status: "pending_review";
  notes: Array<{ author_id: string; author_name: string; text: string; timestamp: string }>;
} {
  const first = c.first_name?.trim() || "";
  const last  = c.last_name?.trim()  || "";
  const name  = `${first} ${last}`.trim() || "(via Doug)";
  const service = c.service_type?.trim() || "General enquiry";
  const message = c.message?.trim() || "(no description provided)";

  // Contact + Doug marker as the first note so Thomas has phone/
  // email at hand without opening the enquiry cross-reference.
  const contactNote =
    `Captured via Doug (website chatbot).\n\n` +
    `Contact: ${name}\n` +
    `Phone: ${c.phone?.trim() || "—"}\n` +
    `Email: ${c.email?.trim() || "—"}\n` +
    `Client type (as told): ${c.client_type ?? "Private"}`;

  return {
    client_name:  name,
    client_type:  jobClientType(c.client_type),
    suburb:       c.suburb?.trim() || null,
    description:  `${service} — ${message}`,
    status:       "pending_review",
    notes: [{
      ...DOUG_SYSTEM_NOTE_AUTHOR,
      text: contactNote,
      timestamp: new Date().toISOString(),
    }],
  };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
