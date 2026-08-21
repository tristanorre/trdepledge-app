import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import HealthPanel, { type StoredCheck } from "@/components/HealthPanel";

export const dynamic = "force-dynamic";

// System health.
//
// Reads the stored results rather than probing on load — the page opens
// instantly and does not call four third-party APIs every time someone
// refreshes. "Run checks now" on the panel re-probes on demand.
//
// The labels live here rather than in lib/health.ts so the checker stays a
// pure server module with no presentation in it; the keys are the contract
// between the two.
const LABELS: Record<string, { label: string; why: string }> = {
  email: {
    label: "Email sending",
    why: "Enquiry notifications and review requests. Needs the domain verified in Resend, not just an API key.",
  },
  push: {
    label: "Push notifications",
    why: "New enquiries, job assignments, leave decisions. Proven by calling OneSignal, so a wrong key shows here.",
  },
  sms: {
    label: "SMS",
    why: "Client reminders the evening before a job, and manual templates from job pages.",
  },
  xero: {
    label: "Xero connection",
    why: "Invoices and quotes. Xero expires a refresh token after 60 days unused, so a quiet period breaks it silently.",
  },
  schema: {
    label: "Database schema",
    why: "Every table the running code needs. Catches a migration that was written but never applied.",
  },
  crons: {
    label: "Scheduled jobs",
    why: "The nightly reminder and hire-expiry sweeps. A cron that stops has no other symptom.",
  },
  push_reach: {
    label: "Notification reach",
    why: "Whether there is anyone for a notification to go to. A push to nobody still succeeds.",
  },
  enquiry_backlog: {
    label: "Enquiry backlog",
    why: "Leads sitting more than three days with no job created — the actual cost of a missed notification.",
  },
};

export default async function AdminHealthPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  let checks: StoredCheck[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("health_checks")
      .select("key, status, detail, since, checked_at");
    checks = (data ?? []) as StoredCheck[];
  }

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1>System health</h1>
        <p className="admin-page-sub">
          Checks that the parts you can&rsquo;t see are actually working. Runs once a
          night and tells you only when something changes — no news is good news.
        </p>
      </header>

      <HealthPanel initial={checks} labels={LABELS} />
    </div>
  );
}
