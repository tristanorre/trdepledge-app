import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { calculateCost, fmtMoney, hoursForEntry, type JobMaterialLine } from "@/lib/cost";
import { getRates } from "@/lib/config";
import { todayISO } from "@/lib/dates";
import { monthStart, monthEnd, addMonthsISO, fmtMonth } from "@/lib/month";
import type { Job, ClientType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CostsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  // Default to the current month. Pass any date in the month to navigate.
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.month ?? "")
    ? searchParams.month!
    : todayISO();
  const start = monthStart(ref);
  const end = monthEnd(ref);

  if (!supabase) {
    return (
      <div>
        <h1 style={titleStyle}>Costs</h1>
        <Banner>Supabase not configured.</Banner>
      </div>
    );
  }

  // Pull data: completed jobs in range, materials joined with catalogue,
  // workers (for name lookup), config rates.
  const [{ data: jobsData }, workersRes, rates] = await Promise.all([
    supabase
      .from("jobs")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .eq("status", "completed")
      .order("date", { ascending: true }),
    supabase.from("users").select("id, name, colour")
      .or("role.eq.worker,field_worker.eq.true").order("name"),
    getRates(supabase),
  ]);

  const jobs = (jobsData ?? []) as Job[];
  const workers = workersRes.data ?? [];
  const workerName = new Map(workers.map((w) => [w.id, w.name]));

  // Fetch all material lines for these jobs in one round trip; group locally.
  const jobIds = jobs.map((j) => j.id);
  const matsByJob = new Map<string, JobMaterialLine[]>();
  if (jobIds.length > 0) {
    const { data: matRows } = await supabase
      .from("job_materials")
      .select(`
        id, job_id, material_id, qty, markup_percent,
        materials_catalogue:material_id ( name, unit, base_price_cents )
      `)
      .in("job_id", jobIds);
    for (const row of (matRows ?? []) as any[]) {
      const list = matsByJob.get(row.job_id) ?? [];
      list.push({
        id: row.id,
        job_id: row.job_id,
        material_id: row.material_id,
        qty: Number(row.qty),
        markup_percent: row.markup_percent,
        name: row.materials_catalogue?.name ?? "(unknown)",
        unit: row.materials_catalogue?.unit ?? "",
        base_price_cents: row.materials_catalogue?.base_price_cents ?? 0,
      });
      matsByJob.set(row.job_id, list);
    }
  }

  // ── Aggregations. All in cents. Single pass over jobs. ─────────────
  let totalRevenue = 0;
  let totalLabour = 0;
  let totalWaiting = 0;
  let materialsCostBase = 0;   // what we paid (base × qty)
  let materialsRevenue = 0;    // what we billed (base × qty × markup)
  const revByType: Record<ClientType, { cents: number; jobs: number }> = {
    "Private":   { cents: 0, jobs: 0 },
    "NDIS":      { cents: 0, jobs: 0 },
    "Aged Care": { cents: 0, jobs: 0 },
  };
  const hoursByWorker = new Map<string, number>();
  let invoicedCount = 0;
  let invoicedRevenue = 0;
  let outstandingCount = 0;
  let outstandingRevenue = 0;
  type TopRow = { id: string; client: string; type: ClientType; total: number; sent: boolean };
  const topRows: TopRow[] = [];

  for (const j of jobs) {
    const lines = matsByJob.get(j.id) ?? [];
    const cost = calculateCost(j, lines, rates);
    totalRevenue += cost.total_cents;
    totalLabour  += cost.labour_cents;
    totalWaiting += cost.waiting_cents;

    revByType[j.client_type as ClientType].cents += cost.total_cents;
    revByType[j.client_type as ClientType].jobs  += 1;

    // Hours-by-worker now uses the per-worker entries in time_log
    // directly (migration 0018) rather than attributing the same crew
    // hours to every assigned worker.
    const log = (j.time_log ?? {}) as Record<string, { start?: string; end?: string }>;
    for (const wid of j.assigned_worker_ids ?? []) {
      const h = hoursForEntry(log[wid]);
      if (h <= 0) continue;
      hoursByWorker.set(wid, (hoursByWorker.get(wid) ?? 0) + h);
    }
    for (const m of lines) {
      materialsCostBase += Math.round(m.base_price_cents * m.qty);
      materialsRevenue  += Math.round(m.base_price_cents * m.qty * (1 + m.markup_percent / 100));
    }
    if (j.invoice_sent && j.xero_invoice_id) {
      invoicedCount++;
      invoicedRevenue += cost.total_cents;
    } else {
      outstandingCount++;
      outstandingRevenue += cost.total_cents;
    }
    topRows.push({
      id: j.id, client: j.client_name, type: j.client_type as ClientType,
      total: cost.total_cents, sent: j.invoice_sent && !!j.xero_invoice_id,
    });
  }
  topRows.sort((a, b) => b.total - a.total);

  const materialsMarkupProfit = materialsRevenue - materialsCostBase;
  const avgJobValue = jobs.length > 0 ? Math.round(totalRevenue / jobs.length) : 0;

  return (
    <div>
      <h1 style={titleStyle}>Costs</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
        Revenue, hours, and materials for completed jobs in the selected month.
        NDIS rates pull from <code>config</code>; markup percentages from
        each job&apos;s materials list.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--navy)" }}>
          {fmtMonth(start)}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href={`/admin/costs?month=${addMonthsISO(start, -1)}`} style={navBtn}>‹ Month</Link>
          <Link href={`/admin/costs?month=${todayISO()}`} style={navBtn} aria-label="This month">Today</Link>
          <Link href={`/admin/costs?month=${addMonthsISO(start,  1)}`} style={navBtn}>Month ›</Link>
        </div>
      </div>

      {/* ── HEADLINE STATS ─────────────────────────────────────────── */}
      <div style={statsGrid}>
        <Stat label="Revenue"           value={fmtMoney(totalRevenue)}        accent="var(--lime)" />
        <Stat label="Jobs completed"    value={String(jobs.length)}           accent="#1A4FB5" />
        <Stat label="Avg job value"     value={fmtMoney(avgJobValue)}         accent="var(--navy)" />
        <Stat label="Markup profit"     value={fmtMoney(materialsMarkupProfit)} accent="#7AAB0F" />
      </div>

      {jobs.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
            No completed jobs in {fmtMonth(start)}.
          </div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            Numbers fill in as jobs are completed (worker clocks out).
          </div>
        </div>
      ) : (
        <>
          {/* ── BY CLIENT TYPE ───────────────────────────────────── */}
          <Section title="Revenue by client type">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(["Private", "NDIS", "Aged Care"] as ClientType[]).map((t) => {
                const r = revByType[t];
                const pct = totalRevenue > 0 ? (r.cents / totalRevenue) * 100 : 0;
                return (
                  <div key={t} style={typeRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14 }}>{t}</span>
                        <span style={{ fontSize: 13, color: "var(--gray)" }}>
                          {r.jobs} job{r.jobs === 1 ? "" : "s"} · {fmtMoney(r.cents)}
                        </span>
                      </div>
                      <div style={barTrack}>
                        <div style={{ ...barFill, width: `${pct}%`, background: typeColour(t) }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── INVOICED VS OUTSTANDING ──────────────────────────── */}
          <Section title="Invoicing">
            <div style={twoCol}>
              <MiniStat
                label={`Invoiced · ${invoicedCount} job${invoicedCount === 1 ? "" : "s"}`}
                value={fmtMoney(invoicedRevenue)}
                fg="#15803D"
              />
              <MiniStat
                label={`Outstanding · ${outstandingCount} job${outstandingCount === 1 ? "" : "s"}`}
                value={fmtMoney(outstandingRevenue)}
                fg={outstandingCount > 0 ? "#B45309" : "var(--gray)"}
                hint={outstandingCount > 0 ? "Send to Xero from the job detail page" : undefined}
              />
            </div>
          </Section>

          {/* ── HOURS BY WORKER ──────────────────────────────────── */}
          <Section title="Hours by worker">
            {hoursByWorker.size === 0 ? (
              <div style={{ color: "var(--gray)", fontSize: 13 }}>No worker hours logged.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Array.from(hoursByWorker.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([wid, h]) => (
                    <div key={wid} style={hourRow}>
                      <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14 }}>
                        {workerName.get(wid) ?? "(unknown)"}
                      </span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)" }}>
                        {h.toFixed(2)} h
                      </span>
                    </div>
                  ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 8 }}>
              Each worker billed against the full job hours from <code>time_log</code>.
              Multi-worker jobs count those hours per worker, matching how
              labour is invoiced.
            </div>
          </Section>

          {/* ── MATERIALS ────────────────────────────────────────── */}
          <Section title="Materials">
            <div style={twoCol}>
              <MiniStat label="Cost (base)" value={fmtMoney(materialsCostBase)} fg="var(--gray)" />
              <MiniStat label="Billed (with markup)" value={fmtMoney(materialsRevenue)} fg="var(--navy)" />
            </div>
            <div style={{ marginTop: 12, padding: 12, background: "var(--off)", borderRadius: 10, fontSize: 13 }}>
              <strong style={{ color: "var(--navy)" }}>Markup profit:</strong>{" "}
              <span style={{ color: "#7AAB0F", fontWeight: 800 }}>
                {fmtMoney(materialsMarkupProfit)}
              </span>
              <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 4 }}>
                Difference between billed and base. This is gross margin on
                materials — labour margin isn&apos;t calculated because we
                don&apos;t store worker pay rates.
              </div>
            </div>
          </Section>

          {/* ── TOP JOBS ─────────────────────────────────────────── */}
          <Section title={`Top ${Math.min(5, topRows.length)} jobs by value`}>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {topRows.slice(0, 5).map((r, i) => (
                <li key={r.id}>
                  <Link href={`/admin/jobs/${r.id}`} style={topRowStyle}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--gray)", width: 28 }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.client}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--gray)" }}>
                        {r.type}{r.sent ? " · invoiced" : " · not yet invoiced"}
                      </div>
                    </div>
                    <span style={{ fontWeight: 800, color: "var(--navy)", whiteSpace: "nowrap" }}>
                      {fmtMoney(r.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

// ── tiny presentation helpers ────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--gray)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1, marginTop: 6 }}>
        {value}
      </div>
      <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: accent }} />
    </div>
  );
}

function MiniStat({ label, value, fg, hint }: { label: string; value: string; fg: string; hint?: string }) {
  return (
    <div style={miniStatCard}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--gray)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: fg, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20, ...cardStyle }}>
      <h2 style={sectionHeader}>{title}</h2>
      {children}
    </section>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      background: "rgba(255, 229, 0, 0.18)",
      border: "1px solid rgba(133, 114, 0, 0.3)",
      color: "#857200", padding: "12px 16px", borderRadius: 10,
      fontSize: 14,
    }}>{children}</div>
  );
}

function typeColour(t: ClientType): string {
  if (t === "NDIS") return "#1A4FB5";
  if (t === "Aged Care") return "var(--navy)";
  return "var(--lime)";
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const navBtn: React.CSSProperties = {
  background: "var(--off)", color: "var(--navy)",
  borderRadius: 8, padding: "8px 12px",
  fontSize: 13, fontWeight: 700,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 36, textDecoration: "none",
};
const statsGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};
const statCard: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
};
const miniStatCard: React.CSSProperties = {
  background: "var(--off)", borderRadius: 12, padding: 14,
  border: "1px solid rgba(0,0,0,0.04)",
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
};
const sectionHeader: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", marginBottom: 12,
};
const twoCol: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};
const typeRow: React.CSSProperties = {
  display: "flex", alignItems: "center",
};
const barTrack: React.CSSProperties = {
  height: 6, background: "var(--gray-light)", borderRadius: 999, overflow: "hidden",
};
const barFill: React.CSSProperties = {
  height: "100%", borderRadius: 999, transition: "width 0.3s",
};
const hourRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "baseline",
  padding: "6px 10px", background: "var(--off)", borderRadius: 8,
};
const topRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "10px 12px", borderRadius: 10,
  background: "var(--off)", color: "var(--black)",
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  marginTop: 16,
};
