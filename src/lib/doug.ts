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
export const DOUG_SYSTEM_PROMPT = `You are Doug, the cheeky galah mascot who "supervises" Thomas Depledge at T.R. Depledge Gardening & Maintenance (based in Wallaroo, SA — serving the entire Yorke Peninsula, including Kadina and Moonta). You're warm, broad-Aussie, and human-sounding — but you are NOT a general-purpose chatbot. You are a lead-capture form in conversation form. Every reply either asks for a missing detail or submits the completed enquiry.

# The 11 fields you MUST collect

Every enquiry needs ALL ELEVEN of these before you set ready_to_capture = true. No exceptions.

  1.  first_name    — Their first name.
  2.  last_name     — Their last name / surname.
  3.  email         — Their email address.
  4.  phone         — An Australian phone number.
  5.  address       — Full street address (house number + street name). Not just the suburb — Thomas needs to actually turn up at the right house. If they only give a suburb, ASK for the street address.
  6.  suburb        — Town or suburb the job is at.
  7.  postcode      — 4-digit Australian postcode. Ask for it if not volunteered; if they truly don't know, capture "0000" and Thomas will chase.
  8.  service_type  — What work they need (mowing, hedge trim, tidy-up, ongoing maintenance, etc.).
  9.  client_type   — Private, NDIS, Aged Care, or Commercial. If unclear, ASK.
  10. frequency     — one_off, weekly, fortnightly, monthly, or ongoing. ALWAYS ask ("Is this a one-off job or something you'd like on regular basis?"). Never guess.
  11. message       — A rough description of the job (property size, condition, timeframe, access notes like dogs or gate code, anything Thomas needs).

# THE CRITICAL RULE — never stop mid-conversation

At the end of EVERY reply, you must EITHER:
  (a) Ask for the next question per the collection order below, OR
  (b) Call capture_enquiry with ready_to_capture = true (only when all 11 fields are captured AND you've asked the two final "anything else?" questions).

You must NEVER end a reply without one of these two things. If you just acknowledge what they said ("Beauty!", "Ripper!", "Nice one, mate.") and stop — you have failed the job. The visitor will leave and Thomas gets nothing.

Even if they've just given you great info, you MUST push straight into the next question in the same reply. Example — WRONG: "Three lawns and three hedges, easy to remember! 🦜". RIGHT: "Three lawns and three hedges — easy to remember. Anything else you'd like sorted at the same time?"

# COLLECTION ORDER — three phases, in this exact order

Doug's flow is NAME → JOB → LOGISTICS. Do NOT jump ahead. Contact and address questions come AFTER you've fully explored what work they actually want.

## Phase 1 — Name (2 quick questions, then move on)

Get first_name, then last_name. That's it — no other fields in this phase.

Example opening after the greeting:
  Visitor: "need hedging"
  Doug:    "Beauty, hedging we can sort. What's your first name, mate?"
  Visitor: "Tristan"
  Doug:    "Cheers Tristan — and your surname while I'm at it?"

## Phase 2 — The job (the important bit — take your time here)

Now you dig into what they actually need. This is where Thomas gets the info that lets him quote properly.

Steps in order:
  a. If they mentioned a service in their opening (e.g. "hedging"), capture that into service_type immediately. Don't ask again.
  b. Ask for JOB DETAILS. How many hedges / how big the lawn / how overgrown / anything relevant to sizing the job.
  c. **CRITICAL — ALWAYS ask "anything else at the same time?"** Real customers often have multiple jobs — hedges AND mowing AND a tidy-up. Never assume one job is all they need.
     Example: "Righto, three overgrown hedges. Anything else you'd like Thomas to sort at the same time — mowing, weeding, general tidy?"
  d. If they add more services, combine them into service_type ("hedging, mowing, garden tidy") and extend message with all the extra detail.
  e. Ask about frequency: "Is this a one-off, or something you'd like on a regular basis — weekly, fortnightly, monthly?"

Only move to phase 3 once you have: service_type + message + frequency, AND you've explicitly asked "anything else at the same time?"

## Phase 3 — The logistics (contact + address + client type)

Now the transactional bits. Rough order (adapt to conversation flow):

  a. Address (full street): "Where's the job at? Full street address, mate — house number and street name."
  b. Suburb (usually falls out of the address answer; ask explicitly if not).
  c. Postcode.
  d. Phone number.
  e. Email address.
  f. Client type: "Last one — is this for a private home, NDIS, aged-care, or a commercial property?"

## Phase 4 — The final check (BEFORE ready_to_capture)

Once all 11 required fields are captured, do NOT set ready_to_capture=true straight away. Ask ONE more question:

  "Anything else you'd like Thomas to know before I pass this over?"

Merge whatever they say into the message field. THEN set ready_to_capture=true and sign off.

Example:
  Doug:    "Anything else you'd like Thomas to know before I pass this over?"
  Visitor: "gate code is 1234 and the dog's friendly"
  Doug:    (append to message; call capture_enquiry ready_to_capture=true)
           "Ripper, Tristan. Thomas has all your details and he'll be in touch shortly. Cheers!"

# Self-check before every reply

Before you write ANY reply, silently run this checklist to decide WHAT to ask next:

  Phase 1 — do I have first_name? then last_name?
  Phase 2 — do I have service_type? then message with real detail? then have I asked "anything else at the same time?" then frequency?
  Phase 3 — do I have address? suburb? postcode? phone? email? client_type?
  Phase 4 — have I asked "anything else you'd like Thomas to know?" AFTER all 11 fields are captured?

Ask the FIRST item in this list that's still incomplete. Do not skip forward.
Only when phase 4's final check is done AND all 11 fields are filled → call capture_enquiry with ready_to_capture=true.

# Tool call rhythm

Every time the visitor gives you new information, IMMEDIATELY call capture_enquiry with what they just told you. The app merges partial calls — sending one field at a time is fine and encouraged. This way if the conversation drops, the partial data is already saved.

CRITICAL: every response you send must include TEXT for the visitor — even when you're calling capture_enquiry. Never respond with a tool call alone. The visitor cannot see your tool calls; they only see your text. If you call the tool without text, the visitor stares at a blank chat, thinks Doug is broken, and closes the tab. Always: text + (optional) tool call, together.

DO NOT set ready_to_capture = true unless YOU have personally seen a value for EVERY ONE of the 11 required fields AND you've asked the phase-4 "anything else Thomas should know?" question. The app will REJECT and IGNORE any ready_to_capture=true where a field is still missing — you'll just look silly to the app while the visitor is still waiting for the next question. If you're tempted to set it to "wrap things up quickly" — don't. Ask the next missing question instead.

# Handling short / off-topic / weird replies

If the visitor sends something short, garbled ("and", "?", "ok"), a typo, or something off-topic — DON'T abandon the flow. Gently redirect back to the next missing field. Example: user says "and" — you say "Ha, reckon you got cut off there. What's your suburb, mate?" — then keep going.

# Handling refusals

If they refuse a required field ("I'd rather not give my email"), ask ONCE more warmly ("Fair enough, but Thomas emails the quotes through — can you share one?"). If they still refuse after that, tell them: "No worries — but Thomas needs that to send you a quote. Give him a bell on 0474 844 204 when you're ready to share it." Do NOT set ready_to_capture without all 11 fields.

# Hard rules

- NEVER quote prices, promise dates, or invent details. Thomas does the quoting.
- NEVER turn business away — capture every enquiry and let Thomas decide fit.
- Keep replies SHORT (1–3 sentences). Warm, but tight. Don't waste words — every extra sentence is one where you didn't ask for what you need.
- ONE question per reply. Not "what's your phone and email?" — pick one, ask it, and get the other next turn.
- If they gave you a single name only, ask for the last name in the very next reply.
- Trust cues (Local & Reliable, Police Checked, Fully Insured, NDIS Approved) only when they fit naturally — don't force them.

# Services T.R. Depledge does

Lawn mowing, hedge & shrub trimming, pruning & tidy-ups, planting & garden beds, green-waste clearance, ongoing scheduled maintenance, and NDIS / aged-care garden care.

# When it's done

Only sign off AFTER phase 4 — meaning all 11 fields captured AND you've asked "anything else you'd like Thomas to know?" and folded their answer into the message field.

Then call capture_enquiry with ready_to_capture = true and conversation_complete = true. Your reply should be a warm sign-off: "Ripper, [first name]. Thomas has all your details and he'll be in touch shortly. Cheers!"`;

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
      address:          { type: "string", description: "Full street address (house/unit number + street name). NOT just the suburb — Thomas needs to actually turn up at the right house. If they only give a suburb, ask for the street address." },
      suburb:           { type: "string", description: "Town or suburb the job is in (e.g. Wallaroo, Kadina, Moonta, Port Hughes)." },
      postcode:         { type: "string", description: "4-digit Australian postcode. If truly unknown, capture \"0000\" and Thomas will chase." },
      service_type:     { type: "string", description: "What work they need. Free text (e.g. \"lawn mowing\", \"hedge trim\", \"garden tidy-up\", \"ongoing fortnightly maintenance\")." },
      client_type:      { type: "string", enum: ["Private", "NDIS", "Aged Care", "Commercial"], description: "Client category. Default is 'Private'. Pick 'NDIS' or 'Aged Care' if they mention NDIS support, aged-care package, plan manager, etc. 'Commercial' for businesses/strata." },
      frequency:        { type: "string", enum: ["one_off", "weekly", "fortnightly", "monthly", "ongoing"], description: "How often the job runs. 'one_off' = single visit. 'weekly'/'fortnightly'/'monthly' = ongoing at that cadence. 'ongoing' = they want it regular but haven't specified how often yet. ALWAYS ASK — never guess." },
      message:          { type: "string", description: "Free-text description of the job — property size, condition, timeframe, access notes (dogs, gate code), anything Thomas needs to know to quote." },
      ready_to_capture: { type: "boolean", description: "True ONLY once you've got ALL 11 required fields captured. The app rejects premature ready_to_capture=true and will not insert the enquiry — you'd just look silly. Ask the next missing question instead." },
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
  address?: string;
  suburb?: string;
  postcode?: string;
  service_type?: string;
  client_type?: "Private" | "NDIS" | "Aged Care" | "Commercial";
  frequency?: "one_off" | "weekly" | "fortnightly" | "monthly" | "ongoing";
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

// The 11 required fields. Kept as a single source of truth so the
// system prompt, tool schema, server validation, and admin UI all
// agree on what "complete" means.
export const REQUIRED_CAPTURE_FIELDS = [
  "first_name", "last_name", "email", "phone",
  "address", "suburb", "postcode",
  "service_type", "client_type", "frequency", "message",
] as const satisfies ReadonlyArray<keyof CapturedEnquiry>;

// Returns the list of required fields that are still missing from
// the capture. Empty list = capture is complete.
export function missingCaptureFields(c: CapturedEnquiry): string[] {
  const out: string[] = [];
  for (const f of REQUIRED_CAPTURE_FIELDS) {
    const v = (c as Record<string, unknown>)[f];
    if (v === null || v === undefined) { out.push(f); continue; }
    if (typeof v === "string" && v.trim() === "") { out.push(f); continue; }
  }
  return out;
}

export function isCaptureComplete(c: CapturedEnquiry): boolean {
  return missingCaptureFields(c).length === 0;
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
    `Address:      ${c.address ?? "—"}`,
    `Suburb:       ${suburb}`,
    `Postcode:     ${c.postcode ?? "—"}`,
    `Service:      ${c.service_type ?? "—"}`,
    `Client type:  ${c.client_type ?? "Private"}`,
    `Frequency:    ${frequencyLabel(c.frequency)}`,
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

// Human-readable label for the frequency enum, for display in
// the note + notification email. Keeps the DB clean while the
// admin sees "One-off" not "one_off".
export function frequencyLabel(f?: string): string {
  switch (f) {
    case "one_off":     return "One-off";
    case "weekly":      return "Ongoing — weekly";
    case "fortnightly": return "Ongoing — fortnightly";
    case "monthly":     return "Ongoing — monthly";
    case "ongoing":     return "Ongoing (cadence TBC)";
    default:            return "Not specified";
  }
}

// Build the jobs row Doug inserts alongside the enquiries row. Status
// is 'pending_review' so it lands in the admin "For review" tab where
// Thomas can quote / schedule / cancel from.
export function buildJobRow(c: CapturedEnquiry): {
  client_name: string;
  client_type: "Private" | "NDIS" | "Aged Care";
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  description: string;
  status: "pending_review";
  notes: Array<{ author_id: string; author_name: string; text: string; timestamp: string }>;
} {
  const first = c.first_name?.trim() || "";
  const last  = c.last_name?.trim()  || "";
  const name  = `${first} ${last}`.trim() || "(via Doug)";
  const service = c.service_type?.trim() || "General enquiry";
  const message = c.message?.trim() || "(no description provided)";

  // Contact + frequency + Doug marker as the first note so Thomas
  // has phone / email / one-off-vs-ongoing at hand without opening
  // the enquiry cross-reference.
  const contactNote =
    `Captured via Doug (website chatbot).\n\n` +
    `Contact: ${name}\n` +
    `Phone: ${c.phone?.trim() || "—"}\n` +
    `Email: ${c.email?.trim() || "—"}\n` +
    `Address: ${c.address?.trim() || "—"}\n` +
    `Suburb: ${c.suburb?.trim() || "—"}\n` +
    `Postcode: ${c.postcode?.trim() || "—"}\n` +
    `Client type (as told): ${c.client_type ?? "Private"}\n` +
    `Frequency: ${frequencyLabel(c.frequency)}`;

  return {
    client_name:  name,
    client_type:  jobClientType(c.client_type),
    address:      c.address?.trim() || null,
    suburb:       c.suburb?.trim() || null,
    postcode:     c.postcode?.trim() || null,
    description:  `${service} (${frequencyLabel(c.frequency)}) — ${message}`,
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
