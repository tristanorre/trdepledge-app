import { requireWorker } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobCard from "@/components/JobCard";
import ConditionPill from "@/components/ConditionPill";
import type { Job } from "@/lib/types";
import type { Asset } from "@/lib/types-inventory";
import { todayISO } from "@/lib/dates";
import { signAssetImageUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

function fmtAllocDate(iso: string | undefined): string {
  if (!iso) return "(date unknown)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "(date unknown)";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default async function WorkerJobsPage() {
  const session = await requireWorker();
  const supabase = getServiceClient();

  let jobs: Job[] = [];
  let allocatedAssets: Asset[] = [];
  const dateByAssetId = new Map<string, string>();
  const dbConfigured = !!supabase;

  if (supabase) {
    // Jobs + currently-allocated kit fetched together.
    const [{ data: jobsData, error: jobsErr }, { data: assetsData }] = await Promise.all([
      supabase
        .from("jobs")
        .select("*")
        .contains("assigned_worker_ids", [session.user.id])
        .neq("status", "cancelled")
        .order("date", { ascending: true, nullsFirst: false })
        .order("scheduled_time", { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from("assets")
        .select("*")
        .eq("assigned_to", session.user.id)
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (jobsErr) console.error("[worker page]", jobsErr);
    jobs = (jobsData ?? []) as Job[];
    allocatedAssets = (assetsData ?? []) as Asset[];

    // Pull "allocated on" dates from audit_log — most recent
    // asset.assigned event handing each asset to this worker wins.
    if (allocatedAssets.length > 0) {
      const { data: events } = await supabase
        .from("audit_log")
        .select("timestamp, item_id")
        .eq("action", "asset.assigned")
        .eq("to_worker_id", session.user.id)
        .in("item_id", allocatedAssets.map((a) => a.id))
        .order("timestamp", { ascending: false });
      for (const ev of (events ?? []) as Array<{ timestamp: string; item_id: string | null }>) {
        if (ev.item_id && !dateByAssetId.has(ev.item_id)) {
          dateByAssetId.set(ev.item_id, ev.timestamp);
        }
      }
    }
  }

  const imageUrlByPath = await signAssetImageUrls(
    supabase,
    allocatedAssets.map((a) => a.image_path),
  );

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

      {dbConfigured && jobs.length === 0 && allocatedAssets.length === 0 && (
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

      {/* My equipment — what Thomas has allocated to this worker, and
          when. Sits between the actionable job sections and the Past
          jobs reference so it acts as a "kit check" before the workday. */}
      <AllocatedKitSection
        assets={allocatedAssets}
        dateByAssetId={dateByAssetId}
        imageUrlByPath={imageUrlByPath}
      />

      {past.length > 0 && <Section title="Past" jobs={past.slice(0, 10)} />}
    </div>
  );
}

function Section({ title, jobs, emptyHint }: { title: string; jobs: Job[]; emptyHint?: string }) {
  if (jobs.length === 0 && !emptyHint) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={sectionHeaderStyle}>
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

function AllocatedKitSection({
  assets, dateByAssetId, imageUrlByPath,
}: {
  assets: Asset[];
  dateByAssetId: Map<string, string>;
  imageUrlByPath: Map<string, string>;
}) {
  if (assets.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={sectionHeaderStyle}>
        My equipment <span style={{ color: "var(--navy)" }}>· {assets.length}</span>
      </h2>
      <div style={{ color: "var(--gray)", fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
        Tools and equipment currently allocated to you — if anything is missing
        or damaged, let Thomas know.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {assets.map((a) => {
          const imageUrl = a.image_path ? imageUrlByPath.get(a.image_path) ?? null : null;
          const allocatedAt = dateByAssetId.get(a.id);
          return (
            <div key={a.id} style={kitRowStyle}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                />
              ) : (
                <div style={{ fontSize: 26, lineHeight: 1, width: 36, textAlign: "center", flexShrink: 0 }}>
                  {a.icon ?? "📦"}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 14 }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
                  {a.category}
                  {a.identifier && <> · {a.identifier}</>}
                  <> · </>
                  <span style={{ fontWeight: 700, color: "var(--navy)" }}>
                    Allocated {fmtAllocDate(allocatedAt)}
                  </span>
                </div>
              </div>
              <ConditionPill condition={a.condition} />
            </div>
          );
        })}
      </div>
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
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "var(--gray)", marginBottom: 10,
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
const kitRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "white", borderRadius: 12, padding: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
