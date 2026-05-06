import { requireWorker } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobCard from "@/components/JobCard";
import type { Job } from "@/lib/types";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function WorkerJobsPage() {
  const session = await requireWorker();
  const supabase = getServiceClient();

  let jobs: Job[] = [];
  let dbConfigured = !!supabase;

  if (supabase) {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .contains("assigned_worker_ids", [session.user.id])
      .neq("status", "cancelled")
      .order("date", { ascending: true, nullsFirst: false })
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .limit(100);

    if (error) console.error("[worker page]", error);
    jobs = (data ?? []) as Job[];
  }

  const today = todayISO();
  const todayJobs = jobs.filter((j) => j.date === today);
  const upcoming  = jobs.filter((j) => j.date && j.date > today);
  const past      = jobs.filter((j) => j.date && j.date < today);
  const undated   = jobs.filter((j) => !j.date);

  return (
    <div>
      <h1 style={titleStyle}>
        Hi {session.user.name.split(" ")[0]}
      </h1>
      <div style={{ color: "var(--gray)", fontSize: 14, marginBottom: 24 }}>
        Your jobs across the next few weeks.
      </div>

      {!dbConfigured && (
        <Banner>Supabase not configured — set <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>.</Banner>
      )}

      {dbConfigured && jobs.length === 0 && (
        <div style={emptyStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>No jobs assigned yet</div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            Jobs will appear here once Thomas assigns you to one.
          </div>
        </div>
      )}

      <Section title="Today" jobs={todayJobs} emptyHint="Nothing scheduled for today." />
      <Section title="Upcoming" jobs={upcoming} />
      {undated.length > 0 && <Section title="Not yet scheduled" jobs={undated} />}
      {past.length > 0 && <Section title="Past" jobs={past.slice(0, 10)} />}
    </div>
  );
}

function Section({ title, jobs, emptyHint }: { title: string; jobs: Job[]; emptyHint?: string }) {
  if (jobs.length === 0 && !emptyHint) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 12, fontWeight: 800, letterSpacing: "1.5px",
        textTransform: "uppercase", color: "var(--gray)", marginBottom: 10,
      }}>
        {title} {jobs.length > 0 && <span style={{ color: "var(--navy)" }}>· {jobs.length}</span>}
      </h2>

      {jobs.length === 0 ? (
        <div style={{ color: "var(--gray)", fontSize: 13, fontStyle: "italic", padding: "8px 4px" }}>
          {emptyHint}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {jobs.map((j) => <JobCard key={j.id} job={j} href={`/worker/jobs/${j.id}`} />)}
        </div>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      background: "rgba(255, 229, 0, 0.18)",
      border: "1px solid rgba(133, 114, 0, 0.3)",
      color: "#857200",
      padding: "12px 16px", borderRadius: 10,
      fontSize: 14, marginBottom: 20,
    }}>
      {children}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
