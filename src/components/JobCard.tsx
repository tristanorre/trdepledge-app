import Link from "next/link";
import { JobStatusPill } from "@/components/StatusPill";
import type { Job } from "@/lib/types";

type Props = {
  job: Job;
  href: string;
  showWorkerCount?: boolean;
};

function formatDate(date: string | null): string {
  if (!date) return "Not scheduled";
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hh = Number(h);
  const mm = m ?? "00";
  const period = hh >= 12 ? "pm" : "am";
  const display = ((hh + 11) % 12) + 1;
  return `${display}:${mm}${period}`;
}

export default function JobCard({ job, href, showWorkerCount }: Props) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "white",
        borderRadius: 14,
        padding: 16,
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        color: "var(--black)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--gray)", fontWeight: 600, marginBottom: 2 }}>
            {formatDate(job.date)}
            {formatTime(job.scheduled_time) && ` · ${formatTime(job.scheduled_time)}`}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>
            {job.client_name}
          </div>
        </div>
        <JobStatusPill status={job.status} />
      </div>

      <div style={{ fontSize: 13, color: "var(--gray)", lineHeight: 1.5 }}>
        {job.suburb && <div>{job.suburb}</div>}
        {job.description && (
          <div style={{ marginTop: 4, color: "#444", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {job.description}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {job.client_type === "NDIS" && (
          <span style={tagStyle("#1A4FB5", "white")}>NDIS</span>
        )}
        {job.client_type === "Aged Care" && (
          <span style={tagStyle("var(--navy)", "white")}>Aged Care</span>
        )}
        {showWorkerCount && job.assigned_worker_ids.length > 0 && (
          <span style={tagStyle("var(--off)", "var(--navy)")}>
            {job.assigned_worker_ids.length} worker{job.assigned_worker_ids.length === 1 ? "" : "s"}
          </span>
        )}
        {showWorkerCount && job.assigned_worker_ids.length === 0 && (
          <span style={tagStyle("rgba(220, 38, 38, 0.12)", "#B91C1C")}>Unassigned</span>
        )}
      </div>
    </Link>
  );
}

function tagStyle(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg, color: fg,
    fontSize: 10, fontWeight: 800,
    padding: "3px 8px", borderRadius: 999,
    letterSpacing: "0.5px", textTransform: "uppercase",
  };
}
