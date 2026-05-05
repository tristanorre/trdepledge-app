import Link from "next/link";
import Image from "next/image";
import HeroCarousel from "@/components/HeroCarousel";
import TownRotator from "@/components/TownRotator";
import Marquee from "@/components/Marquee";
import Reveal from "@/components/Reveal";

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="container">
          <div className="hero-inner">
            <div className="hero-content">
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                Proudly Local · Copper Coast SA
              </div>
              <h1 className="hero-title">
                <span className="hero-title-line1">
                  <TownRotator />
                  <span className="trusted-word"> Trusted</span>
                </span>
                Garden &<br /><em>Maintenance</em><br />Experts
              </h1>
              <p className="hero-desc">
                Across Wallaroo, Kadina, Moonta and the full Yorke Peninsula — T.R. Depledge delivers professional gardening and outdoor maintenance you can count on. Police-checked staff, fair pricing, real results.
              </p>
              <div className="hero-actions">
                <Link href="/contact" className="btn btn-primary btn-lg">Book a Job Today</Link>
                <Link href="/services" className="btn btn-secondary btn-lg">Our Services</Link>
              </div>
              <div className="hero-values">
                <div className="hero-value">Trustworthy</div>
                <div className="hero-value">Hardworking</div>
                <div className="hero-value">Local</div>
                <div className="hero-value">Police Checked</div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="hero-portrait-wrap">
                <Image
                  src="/images/thomas-portrait.jpg"
                  alt="Thomas Depledge — Gardens that impress, maintenance you can trust"
                  className="hero-portrait-img"
                  width={800}
                  height={1000}
                  priority
                />
              </div>
              <HeroCarousel />
              <div className="hero-stats">
                <div className="hero-stat">
                  <div className="hero-stat-num">30+</div>
                  <div className="hero-stat-label">Regular Clients</div>
                </div>
                <div className="hero-stat">
                  <div className="hero-stat-num">80+</div>
                  <div className="hero-stat-label">Homes Serviced</div>
                </div>
                <div className="hero-stat">
                  <div className="hero-stat-num">2020</div>
                  <div className="hero-stat-label">Est. Wallaroo</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Marquee />

      {/* DOUG STRIP */}
      <section style={{ padding: "64px 0", background: "white" }}>
        <div className="container">
          <div className="doug-strip">
            <div className="doug-strip-text">
              <div className="eyebrow dark">Meet the Team</div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,4vw,44px)", color: "var(--navy)", lineHeight: 1.1, marginBottom: 12 }}>
                Meet Thomas &<br />
                <em style={{ color: "var(--lime)", fontStyle: "italic" }}>Doug the Mascot</em>
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--gray)", maxWidth: 440 }}>
                Local. Reliable. Memorable. Thomas and his team bring the energy and the tools to every job across the Copper Coast and Yorke Peninsula — and Doug, the company&apos;s galah mascot, keeps the office lively when everyone&apos;s back at base.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
                <span style={{ background: "var(--navy)", color: "white", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Fast Clean Ups. Neat Finish.</span>
                <span style={{ background: "var(--lime)", color: "var(--navy)", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Clean Cuts. Quality Finish.</span>
                <span style={{ background: "var(--navy)", color: "white", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Quality Work. Done Properly.</span>
              </div>
            </div>
            <div className="doug-strip-images">
              <Image src="/images/doug-1.jpg" alt="Doug the galah mascot" className="doug-img doug-img-1" width={600} height={600} />
              <Image src="/images/doug-2.jpg" alt="Thomas with Doug the galah" className="doug-img doug-img-2" width={600} height={600} />
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT SNIPPET */}
      <section className="about-section">
        <div className="container">
          <div className="about-grid">
            <Reveal className="about-image-wrap">
              <div className="about-img-card" style={{ background: "transparent" }}>
                <Image
                  src="/images/about-snippet.jpg"
                  alt="Thomas Depledge with garden tools"
                  width={800}
                  height={1000}
                  style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", background: "var(--navy)" }}
                />
              </div>
              <div className="about-float-badge">
                <span className="num">2020</span>
                Est. Wallaroo SA
              </div>
            </Reveal>
            <div className="about-content">
              <Reveal className="eyebrow">Our Story</Reveal>
              <Reveal as="h2" className="section-title">Built on Hard Work<br />& <em>Local Pride</em></Reveal>
              <div className="about-story">
                <Reveal as="p" className="lead">
                  T.R. Depledge started as one young local&apos;s idea, inspired by two grandmothers with beautiful gardens — and a determination to build something real.
                </Reveal>
                <Reveal as="p">
                  Thomas Depledge founded the business on 30 November 2020 while juggling university study and two jobs. What began as a one-day-a-week operation has grown into a full-time team serving over 30 regular clients across the Copper Coast — including the Moonta Bay Lifestyle Estate.
                </Reveal>
              </div>
              <Reveal className="milestone-row">
                <div className="milestone">
                  <div className="milestone-year">2020</div>
                  <div className="milestone-label">ABN Registered</div>
                </div>
                <div className="milestone">
                  <div className="milestone-year">2024</div>
                  <div className="milestone-label">Full-Time Operation</div>
                </div>
                <div className="milestone">
                  <div className="milestone-year">6</div>
                  <div className="milestone-label">Team Members</div>
                </div>
              </Reveal>
              <Reveal style={{ marginTop: 28 }}>
                <Link href="/about" className="btn btn-outline">Read the Full Story →</Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES PREVIEW */}
      <section className="services-section">
        <div className="container">
          <div className="services-header">
            <Reveal className="eyebrow dark">What We Do</Reveal>
            <Reveal as="h2" className="section-title">Everything Your Garden<br />and Yard <em style={{ color: "var(--lime)" }}>Needs</em></Reveal>
            <Reveal as="p" className="section-lead">Professional gardening and maintenance across the Copper Coast and Yorke Peninsula. Honest pricing, quality results.</Reveal>
          </div>
          <div className="services-grid">
            <Reveal className="service-card">
              <div className="service-icon">🌿</div>
              <div className="service-name">Garden Maintenance</div>
              <div className="service-desc">Regular lawn mowing, edging, weeding, pruning and general upkeep. We keep your garden looking its best year round.</div>
              <span className="service-tag lime">Most Popular</span>
            </Reveal>
            <Reveal delay={1} className="service-card">
              <div className="service-icon">🌱</div>
              <div className="service-name">Instant Lawn Installs</div>
              <div className="service-desc">Supply and lay instant turf for a lush, green lawn. We prepare, lay and finish — ready for you to enjoy immediately.</div>
            </Reveal>
            <Reveal delay={2} className="service-card">
              <div className="service-icon">🏡</div>
              <div className="service-name">Yard Revamps</div>
              <div className="service-desc">Complete outdoor transformations — new gardens, gravel paths, raised beds and landscaping tailored to your vision and budget.</div>
            </Reveal>
            <Reveal delay={1} className="service-card">
              <div className="service-icon">⛏️</div>
              <div className="service-name">Landscaping</div>
              <div className="service-desc">Gravel, mulch, soil, garden borders, planting and more. Quality materials, quality finish, every time.</div>
            </Reveal>
            <Reveal delay={2} className="service-card">
              <div className="service-icon">♿</div>
              <div className="service-name">NDIS Support</div>
              <div className="service-desc">Police-checked, trusted staff experienced in supporting NDIS participants with garden and yard maintenance as part of their care plan.</div>
              <span className="service-tag blue">NDIS Approved</span>
            </Reveal>
            <Reveal delay={3} className="service-card">
              <div className="service-icon">❤️</div>
              <div className="service-name">Aged Care</div>
              <div className="service-desc">Friendly, reliable garden support for elderly clients and aged care facilities across the Copper Coast.</div>
              <span className="service-tag">Aged Care</span>
            </Reveal>
          </div>
          <Reveal style={{ textAlign: "center", marginTop: 48 }}>
            <Link href="/services" className="btn btn-outline btn-lg">View All Services →</Link>
          </Reveal>
        </div>
      </section>

      {/* WHY US */}
      <section className="whyus-section">
        <div className="whyus-inner container">
          <div className="whyus-grid">
            <div>
              <Reveal className="eyebrow">Why Choose Us</Reveal>
              <Reveal as="h2" className="section-title light">The T.R. Depledge<br /><em>Difference</em></Reveal>
              <Reveal as="p" className="section-lead light">We&apos;re not just another gardening company — we&apos;re your neighbours, and we care about this community as much as you do.</Reveal>
              <div className="whyus-points">
                <Reveal className="whyus-point">
                  <div className="whyus-point-icon">✅</div>
                  <div>
                    <div className="whyus-point-title">All Staff Police Checked</div>
                    <div className="whyus-point-desc">Every team member undergoes a police check before working with any client. Your safety is our priority.</div>
                  </div>
                </Reveal>
                <Reveal delay={1} className="whyus-point">
                  <div className="whyus-point-icon">📍</div>
                  <div>
                    <div className="whyus-point-title">Genuinely Local</div>
                    <div className="whyus-point-desc">We live here, we work here, we&apos;re part of this community. Proudly local, supporting locals, employing locals.</div>
                  </div>
                </Reveal>
                <Reveal delay={2} className="whyus-point">
                  <div className="whyus-point-icon">💰</div>
                  <div>
                    <div className="whyus-point-title">Transparent Pricing</div>
                    <div className="whyus-point-desc">Clear, published rates with no hidden fees. Contact us for a quote — we provide honest, transparent pricing tailored to your job.</div>
                  </div>
                </Reveal>
                <Reveal delay={3} className="whyus-point">
                  <div className="whyus-point-icon">🤝</div>
                  <div>
                    <div className="whyus-point-title">NDIS & Aged Care Specialists</div>
                    <div className="whyus-point-desc">Experienced working with NDIS participants, aged care facilities and Home Care Package providers.</div>
                  </div>
                </Reveal>
              </div>
            </div>
            <div className="whyus-cta-side">
              <Reveal className="trust-card">
                <div className="trust-card-title">Ready to Get Started?</div>
                <div className="trust-item"><div className="trust-check">✓</div> Police-checked, trusted team</div>
                <div className="trust-item"><div className="trust-check">✓</div> NDIS & Aged Care approved</div>
                <div className="trust-item"><div className="trust-check">✓</div> Wallaroo, Kadina & Moonta</div>
                <div className="trust-item"><div className="trust-check">✓</div> Online booking available</div>
                <div className="trust-item"><div className="trust-check">✓</div> All major payments accepted</div>
                <Link href="/contact" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 24 }}>Book a Job Online →</Link>
              </Reveal>
              <Reveal delay={1} className="contact-card">
                <div className="contact-card-title">Prefer to Call?</div>
                <div className="contact-detail">📞 <a href="tel:0474844204">0474 844 204</a></div>
                <div className="contact-detail">✉️ <a href="mailto:t.rdepledge@outlook.com">t.rdepledge@outlook.com</a></div>
                <div className="contact-detail">📍 Copper Coast & Yorke Peninsula</div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICE AREAS */}
      <section className="areas-section">
        <div className="container">
          <div className="areas-header">
            <Reveal className="eyebrow dark">Where We Work</Reveal>
            <Reveal as="h2" className="section-title">Service <em>Areas</em></Reveal>
            <Reveal as="p" className="section-lead" style={{ margin: "0 auto" }}>Covering the full Copper Coast region and Yorke Peninsula. Not sure if we cover your area? Give us a call.</Reveal>
          </div>
          <div className="areas-grid">
            {[
              ["🏖️", "Wallaroo", "Our home base"],
              ["🌾", "Kadina", "Copper Coast hub"],
              ["🏡", "Moonta", "Heritage township"],
              ["🌊", "Moonta Bay", "Lifestyle Estate partner"],
              ["🌿", "Copper Coast", "Full region covered"],
              ["🗺️", "Yorke Peninsula", "Full peninsula covered"],
            ].map(([icon, name, note], i) => (
              <Reveal key={name} delay={((i % 3) + 1) as 1 | 2 | 3} className="area-card">
                <div className="area-icon">{icon}</div>
                <div className="area-name">{name}</div>
                <div className="area-note">{note}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* BOOK CTA */}
      <section className="book-section">
        <div className="container">
          <div className="book-inner">
            <Reveal className="eyebrow" style={{ justifyContent: "center", color: "var(--lime)" }}>
              Get Started Today
            </Reveal>
            <Reveal as="h2" className="section-title light">Ready for a <em>Better</em><br />Garden?</Reveal>
            <Reveal as="p" className="section-lead light" style={{ margin: "0 auto" }}>Book online or give Thomas a call. We&apos;ll get your garden sorted — professionally, reliably, and at a fair price.</Reveal>
            <Reveal className="book-actions">
              <Link href="/contact" className="btn btn-primary btn-lg">Book Online Now →</Link>
              <a href="tel:0474844204" className="btn btn-secondary btn-lg">📞 0474 844 204</a>
            </Reveal>
            <Reveal className="book-payment-methods">
              {["Visa", "Mastercard", "Apple Pay", "Google Pay", "Afterpay", "EFTPOS"].map((p) => (
                <span key={p} className="payment-pill">{p}</span>
              ))}
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
