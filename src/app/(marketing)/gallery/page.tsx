import type { Metadata } from "next";
import Image from "next/image";
import BookCta from "@/components/BookCta";
import { getServiceClient } from "@/lib/supabase";
import { signPhotoUrls } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Our Work",
  description:
    "Real before-and-after results from T.R. Depledge Gardening & Maintenance projects across the Copper Coast and Yorke Peninsula.",
};

export const dynamic = "force-dynamic";

// Curated by admin on /admin/photos. Empty featured_photos falls back
// to the eight static images so the page never renders bare.
const STATIC_FALLBACK = [
  { src: "/images/gallery-1.jpg", caption: "Hedge & Garden Care" },
  { src: "/images/gallery-2.jpg", caption: "Lawn & Edging" },
  { src: "/images/gallery-3.jpg", caption: "Yard Revamp" },
  { src: "/images/gallery-4.jpg", caption: "Landscaping" },
  { src: "/images/gallery-5.jpg", caption: "Garden Clean-Up" },
  { src: "/images/gallery-6.jpg", caption: "Hedge Trimming" },
  { src: "/images/gallery-7.jpg", caption: "Mowing & Maintenance" },
  { src: "/images/gallery-8.jpg", caption: "Garden Beds" },
];

type FeaturedRow = {
  storage_path: string;
  kind: "before" | "after";
  caption: string | null;
  sort_order: number;
  featured_at: string;
  job: { client_name: string; suburb: string | null } | null;
};

export default async function GalleryPage() {
  const supabase = getServiceClient();
  let featured: Array<{ url: string; caption: string; kind: "before" | "after" }> = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("featured_photos")
      .select(`
        storage_path, kind, caption, sort_order, featured_at,
        job:job_id ( client_name, suburb )
      `)
      .order("sort_order", { ascending: true })
      .order("featured_at", { ascending: false })
      .limit(60);
    if (error) console.error("[gallery]", error);

    const rows = ((data ?? []) as unknown) as FeaturedRow[];
    const signed = await signPhotoUrls(supabase, rows.map((r) => r.storage_path));
    const urlByPath = new Map(signed.map((s) => [s.path, s.url]));
    for (const r of rows) {
      const url = urlByPath.get(r.storage_path);
      if (!url) continue;
      // Prefer the admin-supplied caption, then fall back to a synthesised
      // one from the job context ("Hedge Trim — Wallaroo · Before").
      const cap = r.caption
        ?? [
              r.job?.client_name,
              r.job?.suburb,
              r.kind === "before" ? "Before" : "After",
            ].filter(Boolean).join(" · ");
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

      <div className="gallery-grid">
        {showFeatured
          ? featured.map((g, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={`${g.url}-${i}`} className="gallery-item">
                <img src={g.url} alt={g.caption} />
                <div className="gallery-overlay">
                  <span>{g.caption}</span>
                </div>
              </div>
            ))
          : STATIC_FALLBACK.map((g) => (
              <div key={g.src} className="gallery-item">
                <Image src={g.src} alt={g.caption} width={1200} height={800} />
                <div className="gallery-overlay"><span>{g.caption}</span></div>
              </div>
            ))}
      </div>

      <BookCta
        eyebrow="Your Garden Next?"
        title={<>Want a Yard That <em>Turns</em><br />Heads?</>}
        lead="Get in touch and we'll transform your garden — clean, neat, and done properly."
        primaryLabel="Book a Job →"
      />
    </>
  );
}
