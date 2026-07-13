import type { Metadata } from "next";
import BookCta from "@/components/BookCta";
import { getServiceClient } from "@/lib/supabase";
import { signPhotoUrls } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Our Work",
  description:
    "Real before-and-after results from T.R. Depledge Gardening & Maintenance projects across the Copper Coast and Yorke Peninsula.",
};

export const dynamic = "force-dynamic";

// Gallery is entirely admin-curated via /admin/photos. Until at least
// one photo is featured the grid renders blank — no static fallback,
// no placeholder tiles, per Thomas's request.
// Public captions are deliberately just "Before" / "After" — no client
// names, no suburbs, no admin free-text — to keep client details off
// the public marketing site.
type FeaturedRow = {
  storage_path: string;
  kind: "before" | "after";
  sort_order: number;
  featured_at: string;
};

export default async function GalleryPage() {
  const supabase = getServiceClient();
  let featured: Array<{ url: string; caption: string; kind: "before" | "after" }> = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("featured_photos")
      .select("storage_path, kind, sort_order, featured_at")
      .order("sort_order", { ascending: true })
      .order("featured_at", { ascending: false })
      .limit(60);
    if (error) console.error("[gallery]", error);

    const rows = (data ?? []) as FeaturedRow[];
    const signed = await signPhotoUrls(supabase, rows.map((r) => r.storage_path));
    const urlByPath = new Map(signed.map((s) => [s.path, s.url]));
    for (const r of rows) {
      const url = urlByPath.get(r.storage_path);
      if (!url) continue;
      const cap = r.kind === "before" ? "Before" : "After";
      featured.push({ url, caption: cap, kind: r.kind });
    }
  }

  const showFeatured = featured.length > 0;

  return (
    <>
      <section className="gallery-hero">
        <div className="container">
          <div className="eyebrow" style={{ justifyContent: "center" }}>Our Work</div>
          <h1 className="section-title light" style={{ marginBottom: 16 }}>
            Before &amp; After <em>Gallery</em>
          </h1>
          <p className="section-lead light" style={{ margin: "0 auto" }}>
            Real results for real clients across the Copper Coast.
          </p>
        </div>
      </section>

      {showFeatured && (
        <div className="gallery-grid">
          {featured.map((g, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <div key={`${g.url}-${i}`} className="gallery-item">
              <img src={g.url} alt={g.caption} />
              <div className="gallery-overlay">
                <span>{g.caption}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <BookCta
        eyebrow="Your Garden Next?"
        title={<>Want a Yard That <em>Turns</em><br />Heads?</>}
        lead="Get in touch and we'll transform your garden — clean, neat, and done properly."
        primaryLabel="Book a Job →"
      />
    </>
  );
}
