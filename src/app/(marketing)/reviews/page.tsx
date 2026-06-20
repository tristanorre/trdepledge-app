import type { Metadata } from "next";
import BookCta from "@/components/BookCta";
import Testimonial, { TESTIMONIALS } from "@/components/Testimonial";

export const metadata: Metadata = {
  title: "Reviews",
  description:
    "Real reviews from T.R. Depledge Gardening & Maintenance clients across Wallaroo, Kadina, Moonta and the Copper Coast.",
};

export default function ReviewsPage() {
  return (
    <>
      <section style={{ padding: "80px 0", background: "var(--yellow)" }}>
        <div className="container" style={{ maxWidth: 760, textAlign: "center" }}>
          <div className="eyebrow dark" style={{ justifyContent: "center" }}>What Our Clients Say</div>
          <h1
            className="section-title"
            style={{ marginBottom: 16 }}
          >
            Real Words from <em>Real Locals</em>
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--navy)", marginBottom: 40, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
            We&apos;re proud of the work we do across the Copper Coast — here&apos;s what some of our clients have to say.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {TESTIMONIALS.map((t, i) => (
              <Testimonial
                key={`${t.name}-${i}`}
                quote={t.quote}
                name={t.name}
                source={t.source}
                rating={t.rating}
              />
            ))}
          </div>
        </div>
      </section>

      <BookCta />
    </>
  );
}
