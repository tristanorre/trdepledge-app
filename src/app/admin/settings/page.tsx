import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { getIntegrationStatuses, type IntegrationKey } from "@/lib/integrations";
import XeroConnectButton from "@/components/XeroConnectButton";

export const dynamic = "force-dynamic";

const META: Record<IntegrationKey, {
  name: string;
  blurb: string;
  triggers: string[];
  setupHint: string;
}> = {
  twilio: {
    name: "Twilio (SMS)",
    blurb: "Auto-replies to enquiries, booking confirmations, and one-tap manual templates from job detail pages.",
    triggers: [
      "Auto: enquiry received → reply within 60s",
      "Auto: Square booking → confirmation",
      "Manual: On our way / Job complete / Quote follow-up / NDIS / custom",
    ],
    setupHint: "twilio.com → Account SID, Auth Token, From Number",
  },
  onesignal: {
    name: "OneSignal (Push)",
    blurb: "Push notifications for job assignment, schedule changes, leave decisions.",
    triggers: [
      "Worker: new job assigned, schedule change, leave decision",
      "Admin: new enquiry, new Square booking, leave submitted",
    ],
    setupHint: "OneSignal app already created — add NEXT_PUBLIC_ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY to Vercel",
  },
  xero: {
    name: "Xero (Invoicing & Payroll)",
    blurb: "Send fully NDIS-compliant invoices on completion, push approved timesheets to payroll.",
    triggers: [
      "On job completion: optional one-tap invoice send (Slice 8)",
      "Weekly: payroll timesheet export (Slice 8)",
    ],
    setupHint: "developer.xero.com → register an app, set redirect URI to /api/admin/xero/callback",
  },
  square: {
    name: "Square (Bookings)",
    blurb: "Webhook listens for completed payments and creates a draft job for Thomas to review.",
    triggers: [
      "PAYMENT_COMPLETED → draft job (status: pending_review)",
      "Auto SMS confirmation to client",
      "Push to Thomas to review and assign workers",
    ],
    setupHint: "Square dashboard → webhook URL: /api/webhooks/square + Subscribe to payment.created and payment.updated",
  },
  email: {
    name: "Email (Resend)",
    blurb: "Email notifications to Thomas when website enquiries arrive. Reply-to is set to the client's address so a reply goes straight back.",
    triggers: [
      "Auto: new enquiry → email to ENQUIRY_NOTIFY_EMAIL",
    ],
    setupHint: "resend.com → API key + verify a sending domain. Set RESEND_API_KEY, RESEND_FROM, ENQUIRY_NOTIFY_EMAIL.",
  },
};

type SearchParams = { xero?: string };

export default async function AdminSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdmin();
  const supabase = getServiceClient();
  const statuses = getIntegrationStatuses();

  // Xero connection: separate from "configured" — connected means OAuth
  // tokens are present in the DB. Configured = the env vars exist.
  let xeroConnected = false;
  let xeroTenantId: string | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("xero_tokens")
      .select("tenant_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data?.tenant_id) {
      xeroConnected = true;
      xeroTenantId = data.tenant_id;
    }
  }

  return (
    <div>
      <h1 style={titleStyle}>Settings</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 24 }}>
        Status of each third-party integration. Items are graceful: anything not configured here just becomes a no-op in production — the app still works.
      </p>

      {searchParams.xero === "connected" && (
        <Banner kind="success">✓ Xero connected. Invoice send actions on completed jobs will now use your account.</Banner>
      )}
      {searchParams.xero?.startsWith("error:") && (
        <Banner kind="error">⚠ Xero connection failed: {searchParams.xero.slice("error:".length)}</Banner>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {statuses.map((s) => {
          const meta = META[s.key];
          // For Xero, "connected" is the meaningful state — env vars
          // alone don't matter to Thomas, only whether the OAuth handshake
          // has completed.
          const showAsConfigured = s.key === "xero" ? xeroConnected : s.configured;
          return (
            <div key={s.key} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--navy)", lineHeight: 1.1 }}>
                    {meta.name}
                  </h2>
                  <p style={{ color: "var(--gray)", fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
                    {meta.blurb}
                  </p>
                </div>
                <StatusPill configured={showAsConfigured} extra={s.key === "xero" && xeroConnected ? `tenant ${xeroTenantId?.slice(0, 8)}…` : null} />
              </div>

              <ul style={triggerListStyle}>
                {meta.triggers.map((t) => <li key={t}>{t}</li>)}
              </ul>

              {!s.configured && s.missing.length > 0 && (
                <div style={hintStyle}>
                  <strong>Missing env vars:</strong> {s.missing.join(", ")}
                  <div style={{ marginTop: 4 }}>{meta.setupHint}</div>
                </div>
              )}

              {s.key === "xero" && s.configured && (
                <div style={{ marginTop: 12 }}>
                  <XeroConnectButton connected={xeroConnected} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, padding: 14, background: "var(--off)", borderRadius: 12, fontSize: 13, color: "var(--gray)", lineHeight: 1.6 }}>
        <strong>Where credentials live:</strong> All keys are Vercel environment variables — nothing sensitive ever lives in the database or source. Update them in the Vercel dashboard and redeploy. The app reads <code>process.env.*</code> on each request.
      </div>

      <p style={{ marginTop: 16 }}>
        <Link href="/admin" style={{ color: "var(--navy)", fontSize: 13 }}>← Back to dashboard</Link>
      </p>
    </div>
  );
}

function StatusPill({ configured, extra }: { configured: boolean; extra?: string | null }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: configured ? "rgba(34,134,58,0.14)" : "rgba(255,229,0,0.18)",
      color: configured ? "#15803D" : "#857200",
      padding: "5px 12px", borderRadius: 999,
      fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: configured ? "#15803D" : "#857200" }} />
      {configured ? "Active" : "Not configured"}
      {extra && <span style={{ fontWeight: 500, opacity: 0.85, textTransform: "none" }}> · {extra}</span>}
    </span>
  );
}

function Banner({ kind, children }: { kind: "success" | "error"; children: React.ReactNode }) {
  const bg = kind === "success" ? "rgba(34,134,58,0.10)" : "rgba(220,38,38,0.10)";
  const fg = kind === "success" ? "#15803D" : "#B91C1C";
  return (
    <div role="alert" style={{
      background: bg, color: fg,
      padding: "12px 16px", borderRadius: 10,
      fontSize: 14, fontWeight: 600,
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14,
  padding: 20, border: "1px solid rgba(0,0,0,0.06)",
};
const triggerListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  marginTop: 12,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "var(--gray)",
};
const hintStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: "rgba(255,229,0,0.10)",
  border: "1px solid rgba(133,114,0,0.2)",
  borderRadius: 8,
  fontSize: 12,
  color: "#857200",
  lineHeight: 1.5,
};
