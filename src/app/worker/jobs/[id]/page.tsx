import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { JobStatusPill } from "@/components/StatusPill";
import AddressLink from "@/components/AddressLink";
import NotesThread from "@/components/NotesThread";
import ClockInOutButton from "@/components/ClockInOutButton";
import WaitingTimePicker from "@/components/WaitingTimePicker";
import JobPhotosSection from "@/components/JobPhotosSection";
import ReceiptsCapture from "@/components/ReceiptsCapture";
import type { Job } from "@/lib/types";
import { signPhotoUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

function fmtDate(date: string | null): string {
  if (!date) return "Not scheduled";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
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

export default async function WorkerJobDetailPage({ params }: { params: { id: string } }) {
  const session = await requireWorker();
  const supabase = getServiceClient();
  if (!supabase) return <p>Database not configured.</p>;

  // .contains() filter doubles as authorisation: workers only see jobs
  // they're assigned to. Anything else returns 404, not 403, so we don't
  // leak whether a job exists.
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .maybeSingle();

  if (error) console.error("[worker/jobs/:id page]", error);
  if (!data) notFound();
  const j = data as Job;

  const [beforePhotos, afterPhotos, receiptPhotos] = await Promise.all([
    signPhotoUrls(supabase, j.photos_before ?? []),
    signPhotoUrls(supabase, j.photos_after ?? []),
    signPhotoUrls(supabase, j.photos_receipts ?? []),
  ]);

  return (
    <div>
      <Link href="/worker" style={backLinkStyle}>← My jobs</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <h1 style={titleStyle}>{j.client_name}</h1>
        <JobStatusPill status={j.status} />
      </div>
      <div style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        {fmtDate(j.date)}{j.scheduled_time ? ` · ${fmtTime(j.scheduled_time)}` : ""}
      </div>

      {(j.address || j.suburb) && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(
            [j.address, j.suburb, j.postcode, "Australia"].filter(Boolean).join(", ")
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          style={mapBtnStyle}
        >
          📍 Open in Maps
        </a>
      )}

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <Row label="Address" value={
          j.address || j.suburb
            ? <AddressLink address={j.address} suburb={j.suburb} postcode={j.postcode} />
            : "—"
        } />
        <Row label="Client type" value={
          <span style={typeBadgeStyle(j.client_type)}>{j.client_type}</span>
        } />
        <Row label="Description" value={j.description || "—"} />
        {j.client_type === "NDIS" && (
          <Row label="NDIS support item" value={
            <code style={{ fontSize: 13, background: "var(--off)", padding: "3px 8px", borderRadius: 6 }}>
              01_019_0120_1_1
            </code>
          } />
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <ClockInOutButton
          jobId={j.id}
          userId={session.user.id}
          // Pass only this worker's entry — `time_log` is keyed by
          // worker uuid since migration 0018, and the button only
          // ever shows / mutates the current user's clock state.
          initialTimeLog={(j.time_log?.[session.user.id] ?? {}) as import("@/lib/cost").TimeEntry}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <WaitingTimePicker
          jobId={j.id}
          initialMinutes={j.waiting_time_minutes ?? 0}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <JobPhotosSection
          jobId={j.id}
          kind="before"
          initialPhotos={beforePhotos}
          canCapture={true}
          canDelete={false}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <JobPhotosSection
          jobId={j.id}
          kind="after"
          initialPhotos={afterPhotos}
          canCapture={true}
          canDelete={false}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <ReceiptsCapture jobId={j.id} initialReceipts={receiptPhotos} />
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <NotesThread initialNotes={j.notes ?? []} postUrl={`/api/worker/jobs/${j.id}/notes`} />
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
  fontFamily: "var(--font-display)", fontSize: 26, color: "var(--navy)",
  lineHeight: 1.15,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
};
const mapBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  background: "var(--lime)", color: "var(--navy)",
  borderRadius: 12, padding: "14px 20px",
  fontSize: 15, fontWeight: 800,
  textDecoration: "none",
  minHeight: 44,
};
