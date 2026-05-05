import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "NDIS & Aged Care Garden Support",
  description:
    "NDIS-compliant garden and yard maintenance for participants across the Copper Coast. Support item 01_019_0120_1_1 at $56.98/hr (2025–26). Aged care and Home Care Package partner.",
};

export default function NdisPage() {
  return (
    <>
      <section className="ndis-hero">
        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div className="eyebrow" style={{ justifyContent: "center", color: "var(--lime)" }}>
            Specialist Services
          </div>
          <h1 className="section-title light" style={{ marginBottom: 16 }}>
            NDIS & Aged Care<br /><em>Garden Support</em>
          </h1>
          <p className="section-lead light" style={{ margin: "0 auto" }}>
            Police-checked, trusted, and experienced in working with participants, plan managers, and aged care providers across the Copper Coast.
          </p>
        </div>
      </section>

      <section className="ndis-body">
        <div className="container">
          <div className="ndis-grid">
            <div>
              <Reveal className="eyebrow">NDIS Services</Reveal>
              <Reveal as="h2" className="section-title">Supporting <em>NDIS</em><br />Participants</Reveal>
              <Reveal as="p" style={{ fontSize: 16, lineHeight: 1.75, color: "#444", marginBottom: 24 }}>
                T.R. Depledge Gardening &amp; Maintenance provides House and Yard Maintenance services for NDIS participants in Wallaroo, Kadina, Moonta and across the Copper Coast region.
              </Reveal>
              <Reveal as="p" style={{ fontSize: 16, lineHeight: 1.75, color: "#444", marginBottom: 32 }}>
                We work with self-managed, plan-managed, and agency-managed participants. All invoicing is fully NDIS-compliant with support item codes, itemised time records, and all required documentation.
              </Reveal>

              <Reveal className="ndis-info-card">
                <div className="ndis-info-title">NDIS Pricing 2025–26</div>
                <div className="ndis-rate-display">
                  <div className="ndis-rate-num">$56.98</div>
                  <div className="ndis-rate-label">per worker, per hour · Standard (non-remote) rate</div>
                </div>
                <div className="ndis-code">
                  <div>
                    <div className="ndis-code-label">Support Item Code</div>
                    01_019_0120_1_1
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--gray)", textAlign: "right" }}>
                    House or Yard<br />Maintenance
                  </div>
                </div>
                <div className="ndis-code">
                  <div>
                    <div className="ndis-code-label">Support Category</div>
                    Core Supports
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--gray)", textAlign: "right" }}>
                    Assistance with<br />Daily Life
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 12, lineHeight: 1.5 }}>
                  Wallaroo is classified MM5 (Small Rural Town) — standard non-remote rate applies. Travel costs may be claimable separately under item 01_799_0120_1_1.
                </div>
              </Reveal>

              <Reveal className="ndis-info-card" style={{ borderLeft: "4px solid #1A4FB5" }}>
                <div className="ndis-info-title">Cancellation Policy</div>
                <p style={{ fontSize: 14, color: "var(--gray)", lineHeight: 1.6 }}>
                  In line with NDIS guidelines, cancellations with less than <strong>7 clear days&apos; notice</strong> may incur the full agreed service fee. A service agreement is provided to all NDIS clients prior to commencement.
                </p>
              </Reveal>
            </div>

            <div>
              <Reveal className="eyebrow">How It Works</Reveal>
              <Reveal as="h2" className="section-title">Getting <em>Started</em><br />is Simple</Reveal>

              <div className="ndis-steps" style={{ marginBottom: 48 }}>
                {[
                  ["Get in Touch", "Call Thomas on 0474 844 204 or email us. Let us know you're an NDIS participant and your funding type (self, plan, or agency managed)."],
                  ["Service Agreement", "We'll provide a service agreement covering the support item, agreed rate, service description, and cancellation policy for you to sign before we start."],
                  ["We Do the Work", "Our police-checked team arrives on schedule and completes your garden maintenance. We document everything — before and after photos, time records, and materials used."],
                  ["NDIS-Compliant Invoice", "We provide a fully compliant invoice with support item code, participant details, itemised time records, and all required documentation — sent directly to you or your plan manager."],
                ].map(([title, desc], i) => (
                  <Reveal key={title} delay={((i % 3) + 1) as 1 | 2 | 3} className="ndis-step">
                    <div className="step-num">{i + 1}</div>
                    <div>
                      <div className="step-title">{title}</div>
                      <div className="step-desc">{desc}</div>
                    </div>
                  </Reveal>
                ))}
              </div>

              <Reveal className="eyebrow">Aged Care</Reveal>
              <Reveal as="h2" className="section-title">Supporting <em>Aged Care</em><br />Clients & Facilities</Reveal>
              <Reveal as="p" style={{ fontSize: 16, lineHeight: 1.75, color: "#444", marginBottom: 20 }}>
                We&apos;re proud to be the garden maintenance partner for the <strong>Moonta Bay Lifestyle Estate</strong>, currently servicing 80+ homes with more to come. We also support Home Care Package clients and Support at Home programme participants throughout the region.
              </Reveal>

              <Reveal style={{ background: "var(--off)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", marginBottom: 12 }}>We work with:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "NDIS participants (all funding types)",
                    "Home Care Package providers",
                    "Support at Home programme clients",
                    "Aged care facilities and lifestyle estates",
                    "Occupational therapist referrals",
                  ].map((line) => (
                    <div key={line} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#444" }}>
                      ✓ {line}
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal>
                <Link href="/contact" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                  Enquire About NDIS or Aged Care →
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
