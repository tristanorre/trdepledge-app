import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPush } from "@/lib/onesignal";
import { sendEmail } from "@/lib/email";
import { todayISO } from "@/lib/dates";

// System health monitoring.
//
// THE PROBLEM THIS SOLVES
// Four failures ran silently for weeks: an unapplied migration (3 weeks), a
// wrong OneSignal key (3 months), an unverified Resend domain (3 months),
// and a cron that has never run. None of them threw anywhere a person
// looked. Enquiries kept saving, so the site looked fine; the notification
// that should have told Thomas about them was the thing that was broken.
//
// WHY NOT REUSE integrations.ts
// It answers "is X configured?" by checking the env var exists. That is
// exactly what missed the OneSignal outage — ONESIGNAL_REST_API_KEY was
// set the whole time, it just held the App ID instead of the REST key.
// Present is not the same as correct. Every check below therefore proves
// the thing WORKS: it calls the API, or reads a row that only exists if
// the feature ran.
//
// DESIGN RULES
//   1. Never throw. A monitor that breaks its host is worse than none.
//      Every probe is wrapped; an unexpected error becomes a 'warn' with
//      the message as detail, not an exception into the cron.
//   2. Never block. Called with waitUntil/after semantics from a cron that
//      has real work to do. Total budget is bounded by PROBE_TIMEOUT_MS.
//   3. Alert on TRANSITION, not on state. A daily "all good" gets muted,
//      and a muted alert looks like coverage while providing none. A check
//      notifies when it breaks and again when it recovers. Nothing in
//      between.
//   4. Say how long. "Push has been broken for 12 days" prompts action;
//      "push is broken" gets postponed. That is what `since` is for.

export type HealthStatus = "ok" | "warn" | "fail";

export type CheckResult = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

type StoredCheck = {
  key: string;
  status: HealthStatus;
  detail: string;
  since: string;
  checked_at: string;
  notified_status: HealthStatus | null;
};

/** Per-probe network timeout. Eight probes, so worst case ~40s if every
 *  external service hangs — comfortably inside a serverless invocation,
 *  and they run concurrently anyway. */
const PROBE_TIMEOUT_MS = 5_000;

/** Tables the running code requires. A missing one means a migration in
 *  the repo was never applied — the review_requests failure, which cost
 *  three weeks of review requests silently doing nothing. */
const REQUIRED_TABLES = [
  "enquiries", "clients", "jobs", "users", "roster",
  "leave_requests", "leave_balances", "daily_timesheets",
  "worker_paid_hours", "review_requests", "equipment", "reservations",
  "notifications", "sms_log", "cron_runs", "health_checks",
] as const;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/** Wraps a probe so a thrown error becomes a result rather than an
 *  exception. Deliberately 'warn' and not 'fail': we could not determine
 *  the state, which is not the same as knowing it is broken, and crying
 *  wolf is how monitors get ignored. */
async function safe(
  key: string,
  label: string,
  fn: () => Promise<Omit<CheckResult, "key" | "label">>,
): Promise<CheckResult> {
  try {
    const r = await fn();
    return { key, label, ...r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      key, label,
      status: "warn",
      detail: `Check could not run: ${msg}`,
    };
  }
}

// ── Probes ──────────────────────────────────────────────────────────────

/** Resend. Proves the domain is VERIFIED, not merely that a key exists —
 *  the domain sat unverified for three months while the key was fine, and
 *  every enquiry notification 403'd. */
async function checkEmail(): Promise<Omit<CheckResult, "key" | "label">> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return { status: "fail", detail: "RESEND_API_KEY or RESEND_FROM is not set — no email can be sent." };
  }

  const res = await fetchWithTimeout("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401 || res.status === 403) {
    return { status: "fail", detail: "Resend rejected the API key." };
  }
  if (!res.ok) {
    return { status: "warn", detail: `Resend returned ${res.status}.` };
  }

  // The from-address domain is the one that has to be verified. Parsing it
  // out of RESEND_FROM rather than hardcoding means this keeps working if
  // the sending address ever moves.
  const domain = (from.match(/@([^\s>]+)/)?.[1] ?? "").toLowerCase();
  const body = await res.json().catch(() => null) as { data?: Array<{ name?: string; status?: string }> } | null;
  const match = body?.data?.find((d) => (d.name ?? "").toLowerCase() === domain);

  if (!match) {
    return { status: "fail", detail: `${domain} is not registered in Resend — email will 403.` };
  }
  if (match.status !== "verified") {
    return { status: "fail", detail: `${domain} is "${match.status}" in Resend, not verified — email will 403.` };
  }
  return { status: "ok", detail: `Sending as ${domain} (verified).` };
}

/** OneSignal. Calls the API with the REST key, which is the only way to
 *  tell a correct key from a wrong one — the App ID was pasted into the
 *  REST key slot and sat there for three months returning 401. */
async function checkPush(): Promise<Omit<CheckResult, "key" | "label">> {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !restKey) {
    return { status: "fail", detail: "OneSignal app ID or REST key is not set — no push can be sent." };
  }
  if (appId === restKey) {
    return { status: "fail", detail: "REST key is set to the App ID. They are different values — copy the REST API Key from Keys & IDs." };
  }

  const res = await fetchWithTimeout(`https://onesignal.com/api/v1/apps/${appId}`, {
    headers: { Authorization: `Basic ${restKey}` },
  });
  if (res.status === 401 || res.status === 403) {
    return { status: "fail", detail: "OneSignal rejected the REST key — push notifications are not being delivered." };
  }
  if (!res.ok) {
    return { status: "warn", detail: `OneSignal returned ${res.status}.` };
  }
  return { status: "ok", detail: "REST key accepted." };
}

/** Twilio. Same reasoning — credentials present tells you nothing. */
async function checkSms(): Promise<Omit<CheckResult, "key" | "label">> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !process.env.TWILIO_FROM_NUMBER) {
    return { status: "warn", detail: "Twilio is not fully configured — client SMS reminders are off." };
  }
  const res = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
    { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } },
  );
  if (res.status === 401) {
    return { status: "fail", detail: "Twilio rejected the credentials — no SMS is being sent." };
  }
  if (!res.ok) {
    return { status: "warn", detail: `Twilio returned ${res.status}.` };
  }
  return { status: "ok", detail: "Credentials accepted." };
}

/** Xero. Refresh tokens are single-use and die after 60 days unused, so a
 *  quiet period kills the connection with no error anywhere — you only
 *  find out when an invoice fails to send. */
async function checkXero(supabase: SupabaseClient): Promise<Omit<CheckResult, "key" | "label">> {
  const { data } = await supabase
    .from("xero_tokens")
    .select("expires_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { status: "warn", detail: "Xero is not connected — invoices cannot be sent from the app." };
  }
  const refreshedDaysAgo = Math.floor(
    (Date.now() - new Date(data.updated_at as string).getTime()) / 86_400_000,
  );
  // Xero invalidates a refresh token after 60 days without use. Warn well
  // before that so there is time to act rather than time to discover.
  if (refreshedDaysAgo >= 50) {
    return {
      status: "fail",
      detail: `Xero token last refreshed ${refreshedDaysAgo} days ago. Xero expires refresh tokens at 60 days — reconnect now or the link drops.`,
    };
  }
  if (refreshedDaysAgo >= 40) {
    return { status: "warn", detail: `Xero token last refreshed ${refreshedDaysAgo} days ago (expires at 60).` };
  }
  return { status: "ok", detail: `Connected, refreshed ${refreshedDaysAgo} day(s) ago.` };
}

/** Schema drift. Catches the exact failure that lost three weeks of review
 *  requests: a migration sitting in the repo, never applied, and the code
 *  calling a table that was not there. */
async function checkSchema(supabase: SupabaseClient): Promise<Omit<CheckResult, "key" | "label">> {
  const missing: string[] = [];
  await Promise.all(REQUIRED_TABLES.map(async (t) => {
    const { error } = await supabase.from(t).select("*", { head: true, count: "exact" }).limit(1);
    // PGRST205 is "table not found in schema cache" — the signature of an
    // unapplied migration, as opposed to a permissions or network error.
    if (error && error.code === "PGRST205") missing.push(t);
  }));

  if (missing.length > 0) {
    return {
      status: "fail",
      detail: `Missing table(s): ${missing.join(", ")}. A migration in the repo has not been applied.`,
    };
  }
  return { status: "ok", detail: `All ${REQUIRED_TABLES.length} required tables present.` };
}

/** Cron liveness. A scheduled job that silently stops is invisible by
 *  definition — hire-expiry could stop tomorrow and the only symptom would
 *  be tools staying "held" forever. */
async function checkCrons(supabase: SupabaseClient): Promise<Omit<CheckResult, "key" | "label">> {
  const { data } = await supabase
    .from("cron_runs")
    .select("job_name, run_date")
    .order("run_date", { ascending: false })
    .limit(60);

  const rows = data ?? [];
  const stale: string[] = [];
  // Only jobs that have EVER run are checked. A job that has never run at
  // all is a deployment problem, not a liveness problem, and reporting it
  // here every day would be noise — shift-reminder is unscheduled because
  // Vercel Hobby allows two crons and both are used.
  for (const job of ["job-reminders", "hire-expiry"]) {
    const last = rows.find((r) => r.job_name === job);
    if (!last) continue;
    const days = Math.floor(
      (Date.now() - new Date(`${last.run_date}T00:00:00Z`).getTime()) / 86_400_000,
    );
    if (days >= 2) stale.push(`${job} (${days}d)`);
  }
  if (stale.length > 0) {
    return { status: "fail", detail: `Cron has not run: ${stale.join(", ")}.` };
  }
  return { status: "ok", detail: "Scheduled jobs running." };
}

/** Push reach. The key can be valid while nobody is subscribed — a push
 *  sent to zero devices succeeds. Catches "notifications work" being true
 *  and useless at the same time. */
async function checkPushReach(supabase: SupabaseClient): Promise<Omit<CheckResult, "key" | "label">> {
  const { count } = await supabase
    .from("users")
    .select("id", { head: true, count: "exact" })
    .eq("role", "admin")
    .eq("active", true);
  if (!count || count === 0) {
    return { status: "fail", detail: "No active admin users — enquiry notifications have nobody to go to." };
  }
  return { status: "ok", detail: `${count} active admin(s) to notify.` };
}

/** Enquiry backlog. The business reason all of this exists: a lead that
 *  nobody answers is the actual cost of a broken notification.
 *
 *  COUNTS UNOPENED ENQUIRIES, NOT UNCONVERTED ONES. It used to ask for
 *  `converted_to_job_id is null`, which conflates two opposite things: a
 *  lead nobody has looked at, and a lead Thomas answered and correctly
 *  decided not to quote. Most enquiries never become jobs — wrong side of
 *  the peninsula, out of scope, price didn't suit — and that is a normal
 *  outcome, not a fault.
 *
 *  The practical effect was worse than a wrong number. Closed enquiries
 *  never convert and never age out, so the count could only ever climb: at
 *  the time this was fixed it read 18, of which 9 were closed, 7 contacted
 *  and 2 genuinely unopened. The check was on its way to warning forever,
 *  which is the exact failure the notification design warns about — a
 *  monitor nobody can clear gets ignored, and an ignored monitor is worse
 *  than none because it looks like coverage.
 *
 *  `status = 'new'` is the unambiguous signal: the enquiry arrived and
 *  nobody has touched it. That is the state a broken notification actually
 *  produces. `contacted` is deliberately excluded — an open quote waiting on
 *  a customer is normal business, and counting it would rebuild the same
 *  permanent amber more slowly. The `converted_to_job_id` filter stays as a
 *  belt-and-braces guard against a half-written conversion leaving a row
 *  marked new. */
async function checkEnquiryBacklog(supabase: SupabaseClient): Promise<Omit<CheckResult, "key" | "label">> {
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { count } = await supabase
    .from("enquiries")
    .select("id", { head: true, count: "exact" })
    .eq("status", "new")
    .is("converted_to_job_id", null)
    .lt("created_at", threeDaysAgo);

  const n = count ?? 0;
  if (n >= 5) {
    return { status: "warn", detail: `${n} enquiries older than 3 days that nobody has opened.` };
  }
  return {
    status: "ok",
    detail: n === 0 ? "No unopened enquiries." : `${n} unopened enquiry(s) over 3 days old.`,
  };
}

// ── Runner ──────────────────────────────────────────────────────────────

export async function runHealthChecks(supabase: SupabaseClient): Promise<CheckResult[]> {
  return Promise.all([
    safe("email",           "Email sending",     checkEmail),
    safe("push",            "Push notifications", checkPush),
    safe("sms",             "SMS",               checkSms),
    safe("xero",            "Xero connection",   () => checkXero(supabase)),
    safe("schema",          "Database schema",   () => checkSchema(supabase)),
    safe("crons",           "Scheduled jobs",    () => checkCrons(supabase)),
    safe("push_reach",      "Notification reach", () => checkPushReach(supabase)),
    safe("enquiry_backlog", "Enquiry backlog",   () => checkEnquiryBacklog(supabase)),
  ]);
}

/**
 * Runs every check, persists the results, and notifies only on a change of
 * state. Returns the results so a caller (the admin page's manual run) can
 * display them.
 *
 * `notify: false` is used by the admin page — a human looking at the page
 * is already aware, so re-running the checks there must not fire a push.
 */
export async function runAndReport(
  supabase: SupabaseClient,
  opts: { notify: boolean } = { notify: true },
): Promise<CheckResult[]> {
  const results = await runHealthChecks(supabase);

  const { data: priorRows } = await supabase
    .from("health_checks")
    .select("key, status, detail, since, checked_at, notified_status");
  const prior = new Map<string, StoredCheck>(
    ((priorRows ?? []) as StoredCheck[]).map((r) => [r.key, r]),
  );

  const nowIso = new Date().toISOString();
  const transitioned: Array<{ result: CheckResult; since: string }> = [];

  for (const r of results) {
    const before = prior.get(r.key);
    const statusChanged = !before || before.status !== r.status;
    // `since` only moves when the STATUS changes, not when the detail
    // does — otherwise "broken for 12 days" resets every time the message
    // gains a day count, which is the number that makes someone act.
    const since = statusChanged ? nowIso : before.since;

    await supabase.from("health_checks").upsert({
      key: r.key,
      status: r.status,
      detail: r.detail,
      since,
      checked_at: nowIso,
      // Preserve what we last told anyone; the notify step below updates it.
      notified_status: before?.notified_status ?? null,
    }, { onConflict: "key" });

    // Notify on a change against what was last ANNOUNCED, not against the
    // last check. If a push failed to send, the next run tries again
    // instead of assuming the message landed.
    if (r.status !== (before?.notified_status ?? "ok")) {
      transitioned.push({ result: r, since });
    }
  }

  if (opts.notify && transitioned.length > 0) {
    await announce(supabase, transitioned, nowIso).catch((e) =>
      console.error("[health] announce failed", e),
    );
  }

  return results;
}

function humanAge(sinceIso: string): string {
  const mins = Math.floor((Date.now() - new Date(sinceIso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

async function announce(
  supabase: SupabaseClient,
  items: Array<{ result: CheckResult; since: string }>,
  nowIso: string,
): Promise<void> {
  const broke = items.filter((i) => i.result.status !== "ok");
  const fixed = items.filter((i) => i.result.status === "ok");

  const title = broke.length > 0
    ? (broke.some((b) => b.result.status === "fail")
        ? `⚠️ ${broke.length} system issue${broke.length > 1 ? "s" : ""}`
        : `${broke.length} system warning${broke.length > 1 ? "s" : ""}`)
    : `✅ Back to normal`;

  const lines = [
    ...broke.map((b) => `${b.result.label}: ${b.result.detail}`),
    ...fixed.map((f) => `${f.result.label}: recovered after ${humanAge(f.since)}`),
  ];
  const message = lines.join("\n");

  const { data: admins } = await supabase
    .from("users").select("id").eq("role", "admin").eq("active", true);
  const adminIds = (admins ?? []).map((u) => u.id);

  // Push first: it is the channel most likely to be working, and the one
  // Thomas actually sees. Email second and independently — if push is the
  // thing that broke, the email is the only way this message arrives, and
  // vice versa. Neither failure may stop the other.
  if (adminIds.length > 0) {
    await sendPush(
      { user_ids: adminIds, title, message, deep_link: "/admin/health" },
      supabase,
    ).catch((e) => console.error("[health] push failed", e));
  }

  const to = process.env.ENQUIRY_NOTIFY_EMAIL;
  if (to) {
    await sendEmail({
      to,
      subject: `${title} — T.R. Depledge`,
      html: `<p>${lines.map(escapeHtml).join("<br>")}</p>
             <p style="color:#666;font-size:13px">Checked ${new Date(nowIso).toLocaleString("en-AU", { timeZone: "Australia/Adelaide" })} · ${todayISO()}</p>`,
      text: message,
    }).catch((e) => console.error("[health] email failed", e));
  }

  // Only record what we announced AFTER attempting to send. A failed send
  // leaves notified_status untouched so the next run retries rather than
  // silently swallowing the alert — which would be this system committing
  // the exact fault it exists to catch.
  for (const i of items) {
    await supabase.from("health_checks")
      .update({ notified_status: i.result.status, notified_at: nowIso })
      .eq("key", i.result.key);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
