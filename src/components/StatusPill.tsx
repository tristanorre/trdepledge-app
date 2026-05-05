import type { JobStatus, EnquiryStatus } from "@/lib/types";

const JOB_COLOURS: Record<JobStatus, { bg: string; fg: string; label: string }> = {
  scheduled:      { bg: "rgba(26, 79, 181, 0.12)", fg: "#1A4FB5", label: "Scheduled" },
  in_progress:    { bg: "rgba(217, 119, 6, 0.14)", fg: "#B45309", label: "In progress" },
  completed:      { bg: "rgba(34, 134, 58, 0.14)", fg: "#15803D", label: "Completed" },
  cancelled:      { bg: "rgba(107, 114, 128, 0.18)", fg: "#4B5563", label: "Cancelled" },
  pending_review: { bg: "rgba(255, 229, 0, 0.20)", fg: "#857200", label: "Pending review" },
};

const ENQUIRY_COLOURS: Record<EnquiryStatus, { bg: string; fg: string; label: string }> = {
  new:       { bg: "rgba(168, 216, 24, 0.18)", fg: "#3F5C00", label: "New" },
  contacted: { bg: "rgba(26, 79, 181, 0.12)",  fg: "#1A4FB5", label: "Contacted" },
  converted: { bg: "rgba(10, 31, 61, 0.85)",   fg: "#FFFFFF", label: "Converted" },
  closed:    { bg: "rgba(107, 114, 128, 0.18)",fg: "#4B5563", label: "Closed" },
};

export function JobStatusPill({ status }: { status: JobStatus }) {
  const c = JOB_COLOURS[status];
  return <Pill bg={c.bg} fg={c.fg} label={c.label} />;
}

export function EnquiryStatusPill({ status }: { status: EnquiryStatus }) {
  const c = ENQUIRY_COLOURS[status];
  return <Pill bg={c.bg} fg={c.fg} label={c.label} />;
}

function Pill({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
