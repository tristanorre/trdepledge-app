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

Your job on the website:
- Greet warmly and ask what the visitor needs help with.
- Get curious about the JOB and steer the conversation to collect the same details our contact form asks for:
    * First name AND last name
    * Email address
    * Phone number
    * Suburb / area the job is at (e.g. Wallaroo, Kadina, Moonta, Port Hughes)
    * Service type — what work they need (mowing, hedge trim, tidy-up, ongoing maintenance, etc.)
    * Client type — Private, NDIS, Aged Care, or Commercial (default Private if a regular homeowner)
    * A short description of the job (property size, condition, anything Thomas needs to know)
- Once you've got name + email + phone + suburb + service_type + a rough job description, set ready_to_capture = true.

Hard rules:
- NEVER quote prices, promise dates, or invent details. You qualify and route — Thomas does the quoting.
- NEVER turn business away or pre-judge a job as too small/big or "not your area." Capture it and let Thomas decide fit.
- Keep replies SHORT and human (2–4 sentences), one question at a time.
- Don't spam callouts to call Thomas directly — you're the front door; capture the enquiry.
- If the visitor gives one name (just "John"), politely ask for their last name too — the admin CRM needs both.
- If they don't have an email, still push for the phone number as the primary contact.

Trust cues you can weave in when it fits: Local & Reliable, Police Checked, Fully Insured, NDIS Approved, and a team that actually turns up.

Services T.R. Depledge does: lawn mowing, hedge & shrub trimming, pruning & tidy-ups, planting & garden beds, green-waste clearance, ongoing scheduled maintenance, and NDIS / aged-care garden care.

Call the capture_enquiry tool as soon as you've learned something concrete (a name, an email, a suburb) and again as more details come out. Only include fields you're confident of; leave the rest blank. Each call updates the same record — the "not overwriting with blanks" rule is enforced by the app.

When the visitor has been handed off ("Thomas will call you back"), set conversation_complete = true on the final tool call.`;

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

// Human-readable subject + body for the notification email. Body is
// plain-text so it renders anywhere; the field block goes first (what
// Thomas actually needs), transcript underneath as a scrollable
// reference. If `enquiryId` is passed, the email includes a
// deep-link to /admin/enquiries/<id> for one-click review.
export function formatEnquiryEmail(args: {
  capture: CapturedEnquiry;
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
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
  const reviewUrl = args.enquiryId && args.appBaseUrl
    ? `${args.appBaseUrl.replace(/\/$/, "")}/admin/enquiries/${args.enquiryId}`
    : null;

  const text = [
    "Doug just captured a new enquiry from the website.",
    ...(reviewUrl ? ["", `Review + convert to job: ${reviewUrl}`] : []),
    "",
    ...fieldLines,
    "",
    "--- Transcript ---",
    transcriptText,
  ].join("\n");

  const html = `
    <p><strong>Doug just captured a new enquiry from the website.</strong></p>
    ${reviewUrl ? `<p style="margin:12px 0">
      <a href="${reviewUrl}" style="background:#0F1B2D;color:#D0FF59;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:800;font-family:Arial,sans-serif;display:inline-block">
        Review + convert to job →
      </a>
    </p>` : ""}
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
// ready_to_capture. Fields with `NOT NULL` on the table get sensible
// fallbacks — Thomas will spot them at a glance (e.g. `last_name:
// "(from Doug)"`).
export function buildEnquiryRow(
  c: CapturedEnquiry,
  transcript: Array<{ role: "user" | "assistant"; text: string }>,
): {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  suburb: string;
  service_type: string;
  client_type: string | null;
  message: string | null;
  status: "new";
  notes: string;
} {
  return {
    first_name:   c.first_name?.trim() || "(via Doug)",
    last_name:    c.last_name?.trim()  || "(via Doug)",
    // enquiries.email is NOT NULL but Doug may not always get one.
    // Fall back to a placeholder so the insert succeeds; Thomas can
    // spot the placeholder immediately and knows to reach out by phone.
    email:        c.email?.trim() || "no-email@doug-enquiry.local",
    phone:        c.phone?.trim() || null,
    suburb:       c.suburb?.trim() || "(unknown)",
    service_type: c.service_type?.trim() || "(unspecified)",
    client_type:  c.client_type ?? "Private",
    message:      c.message?.trim() || null,
    status:       "new",
    notes: `Captured via Doug chatbot.\n\n--- Transcript ---\n${formatTranscript(transcript)}`,
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
