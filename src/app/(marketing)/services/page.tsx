import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
  // Value pre-selected on the contact form's Service Type dropdown.
  // Must match one of the SERVICE_OPTIONS in ContactForm.tsx, otherwise
  // the dropdown stays empty and the user picks manually.
  enquiry: string;
};

const SERVICES: Service[] = [
  {
    image: "/images/Services/service-garden-maintenance.png",
    imageAlt: "Garden Maintenance — regular lawn mowing and upkeep",
    name: "Garden Maintenance",
    desc: "Our most popular service. Regular lawn mowing, edging, weeding, hedge trimming, pruning and general garden upkeep. We keep your outdoor space looking great all year — without you lifting a finger.",
    tag: { label: "Most Popular", variant: "lime" },
    enquiry: "Garden Maintenance",
  },
  {
    image: "/images/Services/service-yard-revamps.png",
    imageAlt: "Yard Revamps — paving, paths and outdoor transformations",
    name: "Yard Revamps",
    desc: "Complete outdoor transformations — new gardens, gravel paths, raised beds and landscaping tailored to your vision and budget.",
    enquiry: "Yard Revamp",
  },
  {
    image: "/images/Services/service-landscaping.png",
    imageAlt: "Landscaping — soil, mulch and planting",
    name: "Landscaping",
    desc: "From gravel and mulch to soil preparation, border edging, planting and feature installation — we bring quality materials and skilled hands to every landscaping project, big or small.",
    enquiry: "Landscaping",
  },
  {
    image: "/images/Services/service-hedge-trimming.png",
    imageAlt: "Hedge & Tree Trimming — neat hedges and small trees",
    name: "Hedge & Tree Trimming",
    desc: "Overgrown hedges and trees? Our team safely trims and shapes all types of hedging and small trees, leaving your property neat, tidy, and well-maintained.",
    enquiry: "Hedge & Tree Trimming",
  },
  {
    image: "/images/Services/service-garden-cleanups.png",
    imageAlt: "Garden Clean-Ups — raking leaves and clearing green waste",
    name: "Garden Clean-Ups",
    desc: "One-off seasonal clean-ups or pre-sale garden tidy-ups. We clear overgrown areas, remove green waste, and leave your property looking its best — fast and efficiently.",
    enquiry: "Garden Clean-Up",
  },
  {
    image: "/images/Services/service-ndis.png",
    imageAlt: "NDIS Garden Support — supporting NDIS participants",
    name: "NDIS Garden Support",
    desc: "All our staff are police-checked and experienced in supporting NDIS participants. We understand the documentation and invoicing requirements — making the process simple for clients and plan managers alike.",
    tag: { label: "NDIS Approved", variant: "blue" },
    enquiry: "NDIS Garden Support",
  },
  {
    image: "/images/Services/service-aged-care.png",
    imageAlt: "Aged Care Services — garden support for elderly clients",
    name: "Aged Care Services",
    desc: "Caring, reliable garden support for elderly clients and aged care facilities. We're proud partners of the Moonta Bay Lifestyle Estate and support Home Care Package and Support at Home clients across the region.",
    tag: { label: "Aged Care" },
    enquiry: "Aged Care Services",
  },
  {
    image: "/images/Services/service-gift-cards.png",
    imageAlt: "Gift Cards — give the gift of a beautiful garden",
    name: "Gift Cards",
    desc: "Give the gift of a beautiful garden. T.R. Depledge gift cards are perfect for a family member, neighbour, or anyone who deserves a little outdoor help. Available in any amount.",
    enquiry: "Gift Card Enquiry",
  },
  {
    image: "/images/service-landscaping.jpg",
    imageAlt: "Professional landscaping work by T.R. Depledge",
    name: "Premium Landscaping",
    desc: "Bespoke landscape design and installation — turn your outdoor area into a feature you'll love coming home to. Site visit, quote and full project management.",
    enquiry: "Landscaping",
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
              const href = `/contact?service=${encodeURIComponent(s.enquiry)}`;
              if (s.image) {
                return (
                  <Link key={s.name} href={href} className="service-card-link">
                    <Reveal delay={delay} className="service-card service-card-image">
                      <div className="service-poster">
                        <Image src={s.image} alt={s.imageAlt ?? s.name} width={1448} height={1086} />
                      </div>
                      <div className="service-card-body">
                        <div className="service-name">{s.name}</div>
                        <div className="service-desc">{s.desc}</div>
                        <div className="service-card-footer">
                          {s.tag && (
                            <span className={`service-tag${s.tag.variant ? " " + s.tag.variant : ""}`}>{s.tag.label}</span>
                          )}
                          <span className="service-enquire">Enquire →</span>
                        </div>
                      </div>
                    </Reveal>
                  </Link>
                );
              }
              return (
                <Link key={s.name} href={href} className="service-card-link">
                  <Reveal delay={delay} className="service-card">
                    <div className="service-icon">{s.icon}</div>
                    <div className="service-name">{s.name}</div>
                    <div className="service-desc">{s.desc}</div>
                    <div className="service-card-footer">
                      {s.tag && (
                        <span className={`service-tag${s.tag.variant ? " " + s.tag.variant : ""}`}>{s.tag.label}</span>
                      )}
                      <span className="service-enquire">Enquire →</span>
                    </div>
                  </Reveal>
                </Link>
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
