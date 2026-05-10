import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { sanitiseLikeText } from "@/lib/sanitise";

export const dynamic = "force-dynamic";

type Client = {
  id: string;
  name: string;
  type: "Private" | "NDIS" | "Aged Care" | "Commercial";
  suburb: string | null;
  phone: string | null;
  email: string | null;
  service_frequency_days: number | null;
  next_service_due: string | null;
};

const TYPE_OPTIONS = ["", "Private", "NDIS", "Aged Care", "Commercial"];

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: { type?: string; q?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  let clients: Client[] = [];
  const q = (searchParams.q ?? "").trim();

  if (supabase) {
    let query = supabase
      .from("clients")
      .select("id, name, type, suburb, phone, email, service_frequency_days, next_service_due")
      .order("name")
      .limit(500);
    if (searchParams.type) query = query.eq("type", searchParams.type);
    if (q) {
      const safe = sanitiseLikeText(q);
      if (safe) query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
    const { data } = await query;
    clients = (data ?? []) as Client[];
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={titleStyle}>Clients</h1>
        <Link href="/admin/clients/new" style={primaryBtn}>+ New client</Link>
      </div>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
        Persistent client records, used by job creation, SMS lookup, and Xero contact sync.
      </p>

      <form method="GET" style={filterFormStyle}>
        <input
          type="search" name="q" defaultValue={q}
          placeholder="Search name or email…"
          className="form-input"
          style={{ flex: "1 1 200px", minWidth: 0 }}
        />
        <select name="type" defaultValue={searchParams.type ?? ""} className="form-select" style={{ flex: "1 1 140px" }}>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t || "All types"}</option>)}
        </select>
        <button type="submit" style={applyBtnStyle}>Apply</button>
      </form>

      {clients.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👤</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
            {q || searchParams.type ? "No clients match these filters." : "No clients yet."}
          </div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            Tap <strong>+ New client</strong> to add one. The Xero invoice flow will also auto-link clients on first invoice send.
          </div>
        </div>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {clients.map((c) => {
            // Service-due flag: "overdue" if next_service_due is in
            // the past or today, "due soon" if within the next 3
            // days. Recurring clients without a due date show a
            // generic recurrence pill (Thomas hasn't set the next
            // date yet — UI nudges him to).
            const dueFlag = serviceDueFlag(c.next_service_due);
            const isRecurring = c.service_frequency_days != null;
            return (
              <li key={c.id}>
                <Link href={`/admin/clients/${c.id}`} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
                      {c.suburb ?? "—"}
                      {c.phone && <> · {c.phone}</>}
                      {!c.phone && c.email && <> · {c.email}</>}
                      {isRecurring && (
                        <> · every {c.service_frequency_days} day{c.service_frequency_days === 1 ? "" : "s"}</>
                      )}
                    </div>
                  </div>
                  {dueFlag && <span style={dueBadge(dueFlag.kind)}>{dueFlag.label}</span>}
                  <span style={typeBadge(c.type)}>{c.type}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Compute the service-due pill for a client, based on next_service_due
// vs today. Returns null when there's no due date set, or it's far in
// the future. The pill nudges Thomas to roster recurring clients.
function serviceDueFlag(nextDue: string | null): { kind: "overdue" | "due-soon"; label: string } | null {
  if (!nextDue) return null;
  // Compare dates only (no time). Both treated as local-midnight.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${nextDue}T00:00:00`);
  if (!Number.isFinite(due.getTime())) return null;
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { kind: "overdue", label: `${-diffDays}d overdue` };
  if (diffDays === 0) return { kind: "overdue", label: "Due today" };
  if (diffDays <= 3)  return { kind: "due-soon", label: `Due in ${diffDays}d` };
  return null;
}

function dueBadge(kind: "overdue" | "due-soon"): React.CSSProperties {
  const palette = kind === "overdue"
    ? { bg: "rgba(220,38,38,0.14)", fg: "#B91C1C" }
    : { bg: "rgba(255,193,7,0.16)", fg: "#856404" };
  return {
    background: palette.bg, color: palette.fg,
    fontSize: 10, fontWeight: 800, letterSpacing: "0.5px",
    textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
    whiteSpace: "nowrap",
  };
}

function typeBadge(t: Client["type"]): React.CSSProperties {
  const map: Record<Client["type"], [string, string]> = {
    "NDIS":       ["#1A4FB5", "white"],
    "Aged Care":  ["var(--navy)", "white"],
    "Commercial": ["#7AAB0F", "white"],
    "Private":    ["var(--off)", "var(--navy)"],
  };
  const [bg, fg] = map[t];
  return {
    background: bg, color: fg,
    fontSize: 10, fontWeight: 800, letterSpacing: "0.5px",
    textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
    whiteSpace: "nowrap",
  };
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1,
};
const filterFormStyle: React.CSSProperties = {
  display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap",
  background: "white", padding: 12, borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
};
const applyBtnStyle: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const primaryBtn: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  padding: "10px 16px", borderRadius: 8,
  fontSize: 13, fontWeight: 800,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 40,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "white", borderRadius: 12, padding: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  color: "var(--black)",
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
