import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Reviews",
  description:
    "Reviews from T.R. Depledge Gardening & Maintenance clients across Wallaroo, Kadina, Moonta and the Copper Coast.",
};

// Stub. The v16 nav links to /reviews; this page exists so the link
// doesn't 404 while real testimonials are collected. Once we have a
// short list, swap this for a card grid with photo + quote + suburb.
export default function ReviewsPage() {
  return (
    <section style={{ padding: "80px 0", background: "var(--yellow)", minHeight: 480 }}>
      <div className="container" style={{ maxWidth: 720, textAlign: "center" }}>
        <div className="eyebrow dark" style={{ justifyContent: "center" }}>What Our Clients Say</div>
        <h1
          className="section-title"
          style={{ marginBottom: 16 }}
        >
          Reviews <em>coming soon</em>
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--gray)", marginBottom: 24 }}>
          We&apos;re collecting genuine reviews from our regular clients across
          the Copper Coast. If you&apos;ve worked with us and would like to share
          your experience, we&apos;d love to hear from you.
        </p>
        <div style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/contact" className="btn btn-primary">Leave a Review →</Link>
          <Link href="/services" className="btn btn-outline">See What We Offer</Link>
        </div>
      </div>
    </section>
  );
}
