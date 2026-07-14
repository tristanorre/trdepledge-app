import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { signPhotoUrls } from "@/lib/storage";
import FeaturePhotoToggle from "@/components/FeaturePhotoToggle";
import GalleryUploadForm from "@/components/GalleryUploadForm";
import StandalonePhotoDelete from "@/components/StandalonePhotoDelete";
import { fmtDayShort } from "@/lib/dates";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  client_name: string;
  suburb: string | null;
  date: string | null;
  photos_before: string[] | null;
  photos_after: string[] | null;
};

type StandaloneRow = {
  id: string;
  storage_path: string;
  kind: "before" | "after";
  uploaded_at: string;
};

type FilterKey = "all" | "featured" | "unfeatured" | "before" | "after" | "standalone";

const FILTER_BUTTONS: Array<{ key: FilterKey; label: string }> = [
  { key: "all",        label: "All photos" },
  { key: "featured",   label: "Featured only" },
  { key: "unfeatured", label: "Not yet featured" },
  { key: "before",     label: "Before only" },
  { key: "after",      label: "After only" },
  { key: "standalone", label: "Uploaded photos" },
];

// A tile is either from a job or from a standalone upload. The two
// look almost identical on the grid; the only differences are the
// caption (job name vs. "Uploaded photo") and whether a Delete button
// shows (standalone only — deleting a job photo is done from the job
// page).
type Tile = {
  source: "job" | "standalone";
  jobId: string | null;
  jobName: string;
  jobSuburb: string | null;
  jobDate: string | null;
  kind: "before" | "after";
  storagePath: string;
  url: string | undefined;
  featured: boolean;
};

// Curation view — every before/after photo across every completed job
// and every standalone upload in one grid, with a Feature toggle
// beside each. Featured photos surface on the public /gallery.
// Standalone photos come from the upload widget at the top of the
// page (Thomas can add photos from his phone that aren't attached to
// a job).
export default async function AdminPhotosPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  const filter: FilterKey =
    (FILTER_BUTTONS.find((f) => f.key === searchParams.filter)?.key ?? "all");

  let jobs: JobRow[] = [];
  let standalones: StandaloneRow[] = [];
  const featuredPaths = new Set<string>();

  if (supabase) {
    const [{ data: jobsData }, { data: standaloneData }, { data: featData }] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, client_name, suburb, date, photos_before, photos_after")
        .eq("status", "completed")
        .or("photos_before.not.eq.{},photos_after.not.eq.{}")
        .order("date", { ascending: false, nullsFirst: false })
        .order("client_name", { ascending: true })
        .limit(300),
      supabase
        .from("standalone_photos")
        .select("id, storage_path, kind, uploaded_at")
        .order("uploaded_at", { ascending: false })
        .limit(300),
      supabase.from("featured_photos").select("storage_path"),
    ]);
    jobs = (jobsData ?? []) as JobRow[];
    standalones = (standaloneData ?? []) as StandaloneRow[];
    for (const f of (featData ?? []) as Array<{ storage_path: string }>) {
      featuredPaths.add(f.storage_path);
    }
  }

  const flat: Array<{
    source: "job" | "standalone";
    jobId: string | null;
    jobName: string;
    jobSuburb: string | null;
    jobDate: string | null;
    kind: "before" | "after";
    path: string;
  }> = [];
  for (const j of jobs) {
    for (const p of j.photos_before ?? []) {
      flat.push({ source: "job", jobId: j.id, jobName: j.client_name, jobSuburb: j.suburb, jobDate: j.date, kind: "before", path: p });
    }
    for (const p of j.photos_after ?? []) {
      flat.push({ source: "job", jobId: j.id, jobName: j.client_name, jobSuburb: j.suburb, jobDate: j.date, kind: "after", path: p });
    }
  }
  for (const s of standalones) {
    flat.push({
      source: "standalone",
      jobId: null,
      jobName: "Uploaded photo",
      jobSuburb: null,
      jobDate: s.uploaded_at,
      kind: s.kind,
      path: s.storage_path,
    });
  }

  const allPaths = flat.map((f) => f.path);
  const signed = await signPhotoUrls(supabase, allPaths);
  const urlByPath = new Map(signed.map((s) => [s.path, s.url]));

  const tiles: Tile[] = flat.map((f) => ({
    source: f.source,
    jobId: f.jobId,
    jobName: f.jobName,
    jobSuburb: f.jobSuburb,
    jobDate: f.jobDate,
    kind: f.kind,
    storagePath: f.path,
    url: urlByPath.get(f.path),
    featured: featuredPaths.has(f.path),
  }));

  const filtered = tiles.filter((t) => {
    switch (filter) {
      case "featured":   return t.featured;
      case "unfeatured": return !t.featured;
      case "before":     return t.kind === "before";
      case "after":      return t.kind === "after";
      case "standalone": return t.source === "standalone";
      default:           return true;
    }
  });

  const totalCount = tiles.length;
  const featuredCount = tiles.filter((t) => t.featured).length;
  const beforeCount = tiles.filter((t) => t.kind === "before").length;
  const afterCount = tiles.filter((t) => t.kind === "after").length;
  const unfeaturedCount = totalCount - featuredCount;
  const standaloneCount = tiles.filter((t) => t.source === "standalone").length;

  const countByFilter: Record<FilterKey, number> = {
    all: totalCount,
    featured: featuredCount,
    unfeatured: unfeaturedCount,
    before: beforeCount,
    after: afterCount,
    standalone: standaloneCount,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <h1 style={titleStyle}>Photos</h1>
        <Link href="/gallery" style={secondaryBtn} target="_blank" rel="noopener noreferrer">
          View public gallery ↗
        </Link>
      </div>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
        Every before/after photo from every <strong>completed</strong> job, plus any photos you upload directly below. Tap <strong>Feature</strong> to add a photo
        to the public gallery on <Link href="/gallery" style={{ color: "var(--navy)", fontWeight: 700 }}>trdepledgegardeningandmaintenance.com/gallery</Link>.
        Unfeaturing removes it from the site but leaves the original here.
      </p>

      <GalleryUploadForm />

      <div style={filterRowStyle} role="tablist" aria-label="Filter photos">
        {FILTER_BUTTONS.map((f) => {
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={`/admin/photos${f.key === "all" ? "" : `?filter=${f.key}`}`}
              role="tab"
              aria-selected={active}
              style={active ? filterBtnActiveStyle : filterBtnStyle}
            >
              <span>{f.label}</span>
              <span style={active ? countBadgeActiveStyle : countBadgeStyle}>
                {countByFilter[f.key]}
              </span>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
            No photos match this view.
          </div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            Upload photos above, or complete a job with before/after shots.
          </div>
        </div>
      ) : (
        <div style={gridStyle}>
          {filtered.map((t, i) => (
            <PhotoTile key={`${t.storagePath}-${i}`} tile={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoTile({ tile }: { tile: Tile }) {
  const dateStr = tile.jobDate ? fmtDayShort(tile.jobDate) : null;
  return (
    <div style={tileStyle}>
      <div style={imgWrap}>
        {tile.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tile.url} alt={tile.jobName} style={imgStyle} />
        ) : (
          <div style={{ ...imgStyle, background: "var(--off)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gray)" }}>
            (image unavailable)
          </div>
        )}
        <span style={tile.kind === "before" ? kindBadgeBefore : kindBadgeAfter}>
          {tile.kind === "before" ? "BEFORE" : "AFTER"}
        </span>
        {tile.featured && (
          <span style={featuredBadge} title="On the public gallery">★ Featured</span>
        )}
        {tile.source === "standalone" && (
          <span style={standaloneBadge} title="Uploaded directly, not from a job">Uploaded</span>
        )}
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          {tile.source === "job" && tile.jobId ? (
            <Link href={`/admin/jobs/${tile.jobId}`} style={jobLinkStyle}>
              {tile.jobName}
            </Link>
          ) : (
            <div style={jobLinkStyle}>{tile.jobName}</div>
          )}
          <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>
            {tile.source === "job"
              ? `${tile.jobSuburb ?? "—"}${dateStr ? ` · ${dateStr}` : ""}`
              : dateStr ? `Uploaded ${dateStr}` : "Uploaded"}
          </div>
        </div>
        <FeaturePhotoToggle
          jobId={tile.jobId}
          kind={tile.kind}
          storagePath={tile.storagePath}
          featured={tile.featured}
        />
        {tile.source === "standalone" && (
          <StandalonePhotoDelete storagePath={tile.storagePath} />
        )}
      </div>
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1,
};
const secondaryBtn: React.CSSProperties = {
  background: "white", color: "var(--navy)",
  border: "1.5px solid var(--navy)",
  padding: "8px 14px", borderRadius: 8,
  fontSize: 13, fontWeight: 700,
  display: "inline-flex", alignItems: "center", gap: 4,
  minHeight: 40, textDecoration: "none",
};
const filterRowStyle: React.CSSProperties = {
  display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap",
};
const filterBtnStyle: React.CSSProperties = {
  background: "white", color: "var(--navy)",
  border: "1.5px solid rgba(0,0,0,0.12)",
  borderRadius: 999,
  padding: "8px 14px", fontSize: 13, fontWeight: 700,
  display: "inline-flex", alignItems: "center", gap: 8,
  minHeight: 36, textDecoration: "none",
};
const filterBtnActiveStyle: React.CSSProperties = {
  ...filterBtnStyle,
  background: "var(--navy)", color: "white", borderColor: "var(--navy)",
};
const countBadgeStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.06)", color: "var(--navy)",
  borderRadius: 999, padding: "2px 9px",
  fontSize: 12, fontWeight: 800, minWidth: 22, textAlign: "center", lineHeight: 1.4,
};
const countBadgeActiveStyle: React.CSSProperties = {
  ...countBadgeStyle, background: "var(--lime)", color: "var(--navy)",
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 14,
};
const tileStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  overflow: "hidden",
};
const imgWrap: React.CSSProperties = { position: "relative", width: "100%", aspectRatio: "1 / 1", background: "var(--off)" };
const imgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const kindBadgeBefore: React.CSSProperties = {
  position: "absolute", top: 8, left: 8,
  background: "rgba(15,27,45,0.85)", color: "white",
  fontSize: 10, fontWeight: 800, letterSpacing: "0.8px",
  padding: "3px 8px", borderRadius: 999,
};
const kindBadgeAfter: React.CSSProperties = {
  ...kindBadgeBefore,
  background: "rgba(208,255,89,0.95)", color: "var(--navy)",
};
const featuredBadge: React.CSSProperties = {
  position: "absolute", top: 8, right: 8,
  background: "var(--lime)", color: "var(--navy)",
  fontSize: 11, fontWeight: 800, letterSpacing: "0.4px",
  padding: "3px 10px", borderRadius: 999,
};
const standaloneBadge: React.CSSProperties = {
  position: "absolute", bottom: 8, left: 8,
  background: "rgba(15,27,45,0.85)", color: "white",
  fontSize: 10, fontWeight: 800, letterSpacing: "0.6px",
  padding: "3px 8px", borderRadius: 999,
};
const jobLinkStyle: React.CSSProperties = {
  fontWeight: 800, color: "var(--navy)", fontSize: 14,
  textDecoration: "none",
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 40,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
