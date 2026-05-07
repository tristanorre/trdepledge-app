import type { Metadata } from "next";
import Image from "next/image";
import Reveal from "@/components/Reveal";
import BookCta from "@/components/BookCta";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Garden maintenance, lawn installs, yard revamps, landscaping, hedge & tree trimming, garden clean-ups, NDIS support and aged care services across the Copper Coast and Yorke Peninsula.",
};

type Service = {
  icon?: string;
  image?: string;
  imageAlt?: string;
  name: string;
  desc: string;
  tag?: { label: string; variant?: "lime" | "blue" };
};

const SERVICES: Service[] = [
  {
    icon: "🌿",
    name: "Garden Maintenance",
    desc: "Our most popular service. Regular lawn mowing, edging, weeding, hedge trimming, pruning and general garden upkeep. We keep your outdoor space looking great all year — without you lifting a finger.",
    tag: { label: "Most Popular", variant: "lime" },
  },
  {
    image: "/images/service-yard-revamps.jpg",
    imageAlt: "Yard Revamps — before and after garden transformation",
    name: "Yard Revamps",
    desc: "Complete outdoor transformations — new gardens, gravel paths, raised beds and landscaping tailored to your vision and budget.",
  },
  {
    icon: "⛏️",
    name: "Landscaping",
    desc: "From gravel and mulch to soil preparation, border edging, planting and feature installation — we bring quality materials and skilled hands to every landscaping project, big or small.",
  },
  {
    icon: "✂️",
    name: "Hedge & Tree Trimming",
    desc: "Overgrown hedges and trees? Our team safely trims and shapes all types of hedging and small trees, leaving your property neat, tidy, and well-maintained.",
  },
  {
    icon: "🧹",
    name: "Garden Clean-Ups",
    desc: "One-off seasonal clean-ups or pre-sale garden tidy-ups. We clear overgrown areas, remove green waste, and leave your property looking its best — fast and efficiently.",
  },
  {
    icon: "♿",
    name: "NDIS Garden Support",
    desc: "All our staff are police-checked and experienced in supporting NDIS participants. We understand the documentation and invoicing requirements — making the process simple for clients and plan managers alike.",
    tag: { label: "NDIS Approved", variant: "blue" },
  },
  {
    icon: "❤️",
    name: "Aged Care Services",
    desc: "Caring, reliable garden support for elderly clients and aged care facilities. We're proud partners of the Moonta Bay Lifestyle Estate and support Home Care Package and Support at Home clients across the region.",
    tag: { label: "Aged Care" },
  },
  {
    icon: "🎁",
    name: "Gift Cards",
    desc: "Give the gift of a beautiful garden. T.R. Depledge gift cards are perfect for a family member, neighbour, or anyone who deserves a little outdoor help. Available in any amount.",
  },
  {
    image: "/images/service-landscaping.jpg",
    imageAlt: "Professional landscaping work by T.R. Depledge",
    name: "Premium Landscaping",
    desc: "Bespoke landscape design and installation — turn your outdoor area into a feature you'll love coming home to. Site visit, quote and full project management.",
  },
];

export default function ServicesPage() {
  return (
    <>
      {/* v16 yellow hero — drops the `light` class on the title/lead so
          they render in navy instead of white-on-yellow. */}
      <section style={{ background: "var(--yellow)", padding: "80px 0", textAlign: "center" }}>
        <div className="container">
          <div className="eyebrow dark" style={{ justifyContent: "center" }}>Our Services</div>
          <h1 className="section-title" style={{ marginBottom: 16 }}>
            Everything Your Garden<br />and Yard <em>Needs</em>
          </h1>
          <p className="section-lead" style={{ margin: "0 auto" }}>
            Professional gardening and maintenance across the Copper Coast and Yorke Peninsula. Honest pricing, quality results.
          </p>
        </div>
      </section>

      <section style={{ padding: "80px 0" }}>
        <div className="container">
          <div className="services-grid">
            {SERVICES.map((s, i) => {
              const delay = ((i % 3) + 1) as 1 | 2 | 3;
              if (s.image) {
                return (
                  <Reveal key={s.name} delay={delay} className="service-card service-card-image">
                    <div className="service-poster">
                      <Image src={s.image} alt={s.imageAlt ?? s.name} width={800} height={600} />
                    </div>
                    <div className="service-card-body">
                      <div className="service-name">{s.name}</div>
                      <div className="service-desc">{s.desc}</div>
                      {s.tag && (
                        <span className={`service-tag${s.tag.variant ? " " + s.tag.variant : ""}`}>{s.tag.label}</span>
                      )}
                    </div>
                  </Reveal>
                );
              }
              return (
                <Reveal key={s.name} delay={delay} className="service-card">
                  <div className="service-icon">{s.icon}</div>
                  <div className="service-name">{s.name}</div>
                  <div className="service-desc">{s.desc}</div>
                  {s.tag && (
                    <span className={`service-tag${s.tag.variant ? " " + s.tag.variant : ""}`}>{s.tag.label}</span>
                  )}
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <BookCta
        eyebrow="Get a Quote"
        title={<>Interested? <em>Let&apos;s</em> Talk.</>}
        lead="Tell us about your job and we'll provide honest, transparent pricing tailored to your needs."
        primaryLabel="Get a Free Quote →"
      />
    </>
  );
}
