import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { JobStatusPill } from "@/components/StatusPill";
import AddressLink from "@/components/AddressLink";
import NotesThread from "@/components/NotesThread";
import MaterialsList from "@/components/MaterialsList";
import CostBreakdown from "@/components/CostBreakdown";
import JobPhotosSection from "@/components/JobPhotosSection";
import JobSmsPanel from "@/components/JobSmsPanel";
import SendToXeroButton from "@/components/SendToXeroButton";
import ReopenJobButton from "@/components/ReopenJobButton";
import TimeLogEditor from "@/components/TimeLogEditor";
import JobQuotePanel from "@/components/JobQuotePanel";
import type { Job, WorkerListEntry } from "@/lib/types";
import type { JobMaterialLine } from "@/lib/cost";
import { calculateCost } from "@/lib/cost";
import { getRates } from "@/lib/config";
import { signPhotoUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

function fmtDate(date: string | null): string {
  if (!date) return "Not scheduled";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function fmtTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hh = Number(h); const mm = m ?? "00";
  const period = hh >= 12 ? "pm" : "am";
  const display = ((hh + 11) % 12) + 1;
  return `${display}:${mm} ${period}`;
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const supabase = getServiceClient();
  if (!supabase) return <p>Database not configured.</p>;

  // Parallel fetch: job, materials (joined), worker names, rates.
  const [{ data: job }, { data: matRows }, rates] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("job_materials")
      .select(`
        id, job_id, material_id, qty, markup_percent,
        materials_catalogue:material_id ( name, unit, base_price_cents )
      `)
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),
    getRates(supabase),
  ]);

  if (!job) notFound();
  const j = job as Job;

  const materials: JobMaterialLine[] = (matRows ?? []).map((row: any) => ({
    id: row.id,
    job_id: row.job_id,
    material_id: row.material_id,
    qty: Number(row.qty),
    markup_percent: row.markup_percent,
    name: row.materials_catalogue?.name ?? "(unknown)",
    unit: row.materials_catalogue?.unit ?? "",
    base_price_cents: row.materials_catalogue?.base_price_cents ?? 0,
  }));

  let assignedWorkers: WorkerListEntry[] = [];
  if (j.assigned_worker_ids.length > 0) {
    const { data: ws } = await supabase
      .from("users")
      .select("id, name, colour")
      .in("id", j.assigned_worker_ids);
    assignedWorkers = (ws ?? []) as WorkerListEntry[];
  }

  const [beforePhotos, afterPhotos] = await Promise.all([
    signPhotoUrls(supabase, j.photos_before ?? []),
    signPhotoUrls(supabase, j.photos_after ?? []),
  ]);

  const cost = calculateCost(j, materials, rates);
  const isComplete = j.status === "completed";

  // Quote panel needs to know whether Xero is connected so the Send
  // button can be disabled with a helpful hint. Cheap lookup — one
  // row keyed by user id.
  let xeroConnected = false;
  {
    const { data: tok } = await supabase
      .from("xero_tokens")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    xeroConnected = !!tok;
  }
  const isPendingReview = j.status === "pending_review";

  return (
    <div>
      <Link href="/admin/jobs" style={backLinkStyle}>← All jobs</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <h1 style={titleStyle}>{j.client_name}</h1>
        <JobStatusPill status={j.status} />
      </div>
      <div style={{ color: "var(--gray)", fontSize: 14, marginBottom: 24 }}>
        {fmtDate(j.date)}{j.scheduled_time ? ` · ${fmtTime(j.scheduled_time)}` : ""}
      </div>

      <div style={cardStyle}>
        <Row label="Client type" value={
          <span style={typeBadgeStyle(j.client_type)}>{j.client_type}</span>
        } />
        <Row label="Address" value={
          j.address || j.suburb
            ? <AddressLink address={j.address} suburb={j.suburb} postcode={j.postcode} />
            : "—"
        } />
        <Row label="Description" value={j.description || "—"} />
        <Row label="Workers" value={
          assignedWorkers.length === 0 ? (
            <span style={{ color: "#B91C1C", fontWeight: 600 }}>Unassigned</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {assignedWorkers.map((w) => (
                <span key={w.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "var(--off)", color: "var(--navy)",
                  padding: "4px 10px", borderRadius: 999,
                  fontSize: 13, fontWeight: 600,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.colour, display: "inline-block" }} />
                  {w.name}
                </span>
              ))}
            </div>
          )
        } />
        {j.client_type === "NDIS" && (
          <Row label="NDIS support item" value={
            <code style={{ fontSize: 13, background: "var(--off)", padding: "3px 8px", borderRadius: 6 }}>
              01_019_0120_1_1
            </code>
          } />
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Link href={`/admin/jobs/${j.id}/edit`} style={editBtnStyle}>Edit job</Link>
        {j.status === "completed" && <ReopenJobButton jobId={j.id} />}
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <JobPhotosSection
          jobId={j.id}
          kind="before"
          initialPhotos={beforePhotos}
          canCapture={true}
          canDelete={true}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <JobPhotosSection
          jobId={j.id}
          kind="after"
          initialPhotos={afterPhotos}
          canCapture={true}
          canDelete={true}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <MaterialsList jobId={j.id} initialLines={materials} />
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <TimeLogEditor
          jobId={j.id}
          workers={assignedWorkers}
          initialTimeLog={(j.time_log ?? {}) as Record<string, { start?: string; end?: string }>}
        />
      </div>

      {/* Quote estimating — only visible while the job is in
          `pending_review` status. Once Thomas marks it scheduled
          (= quote accepted) or cancelled, this panel disappears and
          the regular cost breakdown takes over from clocked-in time. */}
      {isPendingReview && (
        <div style={{ ...cardStyle, marginTop: 20 }}>
          <JobQuotePanel
            job={j}
            materialsCents={cost.materials_cents}
            rateCents={cost.rate_cents}
            xeroConnected={xeroConnected}
          />
        </div>
      )}

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <CostBreakdown cost={cost} isComplete={isComplete} />
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", marginBottom: 12 }}>
          Send to Xero
        </h3>
        <SendToXeroButton
          jobId={j.id}
          alreadySent={j.invoice_sent}
          invoiceNumber={j.xero_invoice_id}
          jobCompleted={j.status === "completed"}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <JobSmsPanel jobId={j.id} />
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <NotesThread initialNotes={j.notes ?? []} postUrl={`/api/admin/jobs/${j.id}/notes`} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr", gap: 12,
      padding: "12px 0", borderBottom: "1px solid var(--gray-light)",
      fontSize: 14,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--gray)" }}>{label}</div>
      <div style={{ color: "var(--black)" }}>{value}</div>
    </div>
  );
}

function typeBadgeStyle(t: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    "NDIS": ["#1A4FB5", "white"],
    "Aged Care": ["var(--navy)", "white"],
    "Private": ["var(--off)", "var(--navy)"],
  };
  const [bg, fg] = map[t] ?? ["var(--off)", "var(--navy)"];
  return {
    display: "inline-block", background: bg, color: fg,
    fontSize: 11, fontWeight: 800, letterSpacing: "0.5px",
    textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
  };
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
};
const editBtnStyle: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  padding: "12px 20px", borderRadius: 10,
  fontSize: 14, fontWeight: 800,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 44,
};
