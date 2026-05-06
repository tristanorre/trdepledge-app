import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Our Work",
  description:
    "Real before-and-after results from T.R. Depledge Gardening & Maintenance projects across the Copper Coast and Yorke Peninsula.",
};

const GALLERY = [
  { src: "/images/gallery-1.jpg", caption: "Hedge & Garden Care" },
  { src: "/images/gallery-2.jpg", caption: "Lawn & Edging" },
  { src: "/images/gallery-3.jpg", caption: "Yard Revamp" },
  { src: "/images/gallery-4.jpg", caption: "Landscaping" },
  { src: "/images/gallery-5.jpg", caption: "Garden Clean-Up" },
  { src: "/images/gallery-6.jpg", caption: "Hedge Trimming" },
  { src: "/images/gallery-7.jpg", caption: "Mowing & Maintenance" },
  { src: "/images/gallery-8.jpg", caption: "Garden Beds" },
];

export default function GalleryPage() {
  return (
    <>
      <section className="gallery-hero">
        <div className="container">
          <div className="eyebrow" style={{ justifyContent: "center" }}>Our Work</div>
          <h1 className="section-title light" style={{ marginBottom: 16 }}>
            Before & After <em>Gallery</em>
          </h1>
          <p className="section-lead light" style={{ margin: "0 auto" }}>
            Real results for real clients across the Copper Coast. More photos added as we build our portfolio.
          </p>
        </div>
      </section>

      <div className="gallery-grid">
        {GALLERY.map((g) => (
          <div key={g.src} className="gallery-item">
            <Image src={g.src} alt={g.caption} width={1200} height={800} />
            <div className="gallery-overlay"><span>{g.caption}</span></div>
          </div>
        ))}
        <div className="gallery-item">
          <div className="gallery-placeholder" style={{ minHeight: 250 }}>
            <div className="ph-icon">📸</div>
            <span>Before & after photos<br />coming soon</span>
          </div>
        </div>
      </div>

      <section style={{ padding: "64px 0", textAlign: "center", background: "var(--off)" }}>
        <div className="container">
          <p style={{ fontSize: 16, color: "var(--gray)", marginBottom: 24 }}>
            Want to see your garden transformed? Get in touch for a quote.
          </p>
          <Link href="/contact" className="btn btn-primary btn-lg">Book a Job →</Link>
        </div>
      </section>
    </>
  );
}
