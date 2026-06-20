import type { Metadata } from "next";
import Image from "next/image";
import BookCta from "@/components/BookCta";

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
            Real results for real clients across the Copper Coast.
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
