import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type WorkerRow = {
  id: string;
  name: string;
  colour: string | null;
  role: string;
  field_worker: boolean;
  phone: string | null;
  employment_start_date: string | null;
};

// Workers list — entry point for individual worker profiles.
// Includes admins flagged as field_worker (Thomas) so the same row
// gets a profile + inventory listing as the rest of the crew.
export default async function AdminWorkersListPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  let workers: WorkerRow[] = [];
  let allocCounts = new Map<string, number>();
  if (supabase) {
    const [{ data: ws }, { data: assigned }] = await Promise.all([
      supabase
        .from("users")
        .select("id, name, colour, role, field_worker, phone, employment_start_date")
        .or("role.eq.worker,field_worker.eq.true")
        .eq("active", true)
        .order("name"),
      supabase
        .from("assets")
        .select("id, assigned_to")
        .not("assigned_to", "is", null),
    ]);
    workers = (ws ?? []) as WorkerRow[];
    for (const a of assigned ?? []) {
      const k = (a as { assigned_to: string }).assigned_to;
      allocCounts.set(k, (allocCounts.get(k) ?? 0) + 1);
    }
  }

  return (
    <div>
      <Link href="/admin/hr" style={backLinkStyle}>← HR</Link>
      <h1 style={titleStyle}>Workers</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        Active members of the team. Tap any row to view their profile, contact details
        and the inventory currently allocated to them.
      </p>

      {workers.length === 0 ? (
        <div style={emptyStyle}>No active workers.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {workers.map((w) => {
            const count = allocCounts.get(w.id) ?? 0;
            const isThomas = w.role === "admin" && w.field_worker;
            return (
              <Link key={w.id} href={`/admin/hr/workers/${w.id}`} style={rowStyle}>
                <span style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: w.colour ?? "#A8D818", flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 15 }}>
                    {w.name}
                    {isThomas && (
                      <span style={ceoPillStyle}>CEO + field</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
                    {w.phone ?? <em style={{ opacity: 0.7 }}>no phone on file</em>}
                    {w.employment_start_date && (
                      <span> · started {new Date(w.employment_start_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--gray)", fontWeight: 700, textAlign: "right" }}>
                  {count > 0 ? `${count} item${count === 1 ? "" : "s"}` : "no kit"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "white", borderRadius: 12, padding: 14,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  color: "var(--black)",
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", color: "var(--gray)", fontSize: 14,
};
const ceoPillStyle: React.CSSProperties = {
  display: "inline-block", marginLeft: 8,
  background: "var(--lime)", color: "var(--navy)",
  fontSize: 10, fontWeight: 800, letterSpacing: "0.5px",
  textTransform: "uppercase",
  padding: "2px 8px", borderRadius: 999,
};
