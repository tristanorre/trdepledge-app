import type { Metadata } from "next";
import Image from "next/image";
import Reveal from "@/components/Reveal";
import BookCta from "@/components/BookCta";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Founded in Wallaroo on 30 November 2020 by Thomas Depledge. A five-person local team servicing 30+ regular clients. Maintains the grounds at Moonta Bay Lifestyle Estate.",
};

const TEAM = [
  { name: "Thomas Depledge", role: "Owner & CEO", highlight: true },
  { name: "Bradley Depledge", role: "Field Worker" },
  { name: "Aleisha Bussenschutt", role: "Field Worker" },
  { name: "Darrell Woods", role: "Field Worker" },
  { name: "Dave Kay", role: "Field Worker" },
];

export default function AboutPage() {
  return (
    <>
      {/* v16 yellow hero — matches the homepage's voice. Title + eyebrow
          drop the `light` modifier (was for navy bg) so they render in
          navy on yellow. */}
      <section style={{ background: "var(--yellow)", padding: "80px 0", textAlign: "center" }}>
        <div className="container">
          <div className="eyebrow dark" style={{ justifyContent: "center" }}>Our Story</div>
          <h1 className="section-title" style={{ marginBottom: 16 }}>
            Built From the Ground Up<br />in <em>Wallaroo</em>
          </h1>
        </div>
      </section>

      <section style={{ padding: "80px 0", background: "var(--off)" }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <div className="about-story">
            <Reveal as="p" className="lead">
              T.R. Depledge Gardening &amp; Maintenance grew from a simple idea — one young local, two grandmothers with beautiful gardens, and a determination to make something real.
            </Reveal>

            <Reveal style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "32px 0" }}>
              <Image
                src="/images/about-thomas-doug.jpg"
                alt="Thomas with Doug the galah — a team that turns heads"
                width={800}
                height={1000}
                style={{ width: "100%", borderRadius: 20, objectFit: "contain", background: "var(--navy)", maxHeight: 400 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="milestone" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div className="milestone-year">Nov 2020</div>
                  <div className="milestone-label">ABN Registered</div>
                </div>
                <div className="milestone" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div className="milestone-year">2024</div>
                  <div className="milestone-label">Full-time focus</div>
                </div>
                <div className="milestone" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div className="milestone-year">2025</div>
                  <div className="milestone-label">5 team members</div>
                </div>
              </div>
            </Reveal>

            <Reveal as="p">After finishing secondary school, Thomas began studying a Bachelor of Early Childhood Education at the University of South Australia. Juggling full-time study in Magill while travelling from Wallaroo and working two jobs — at Drakes Supermarket and Community Kids Kadina — just to afford to continue, it was an overwhelming time.</Reveal>

            <Reveal as="p">After many conversations with his Mum, Dad, and brother, Thomas started exploring flexible business options. Gardening stood out — not only because there was local demand, but because it was something he&apos;d always genuinely enjoyed.</Reveal>

            <Reveal as="p">A big influence came from his two grandmas, Elizabeth and Shirley. They both had beautiful gardens that Thomas helped maintain as a child — learning so much just by watching, listening, and asking questions over the years.</Reveal>

            <Reveal className="quote-block">
              <p className="quote-text">
                On 30th November 2020, I officially registered my ABN and launched T.R. Depledge Gardening. What began as a one-to-two-day-a-week job has grown into a full-time operation with staff. I never imagined it would grow so quickly.
              </p>
              <div className="quote-author">— Thomas Depledge, Owner & CEO</div>
            </Reveal>

            <Reveal as="p">In 2024, Thomas fully stepped away from childcare and university to focus completely on the business. Now in 2025, with five team members on board, the business maintains the Moonta Bay Lifestyle Estate — around 80 homes with another 120 to come — while supporting over 30 regular clients.</Reveal>

            <Reveal className="quote-block" style={{ background: "var(--lime)" }}>
              <p className="quote-text" style={{ color: "var(--navy)" }}>
                And this is only the beginning — I&apos;m excited to see how much more we can achieve as a team, growing from that once small idea into something truly special.
              </p>
              <div className="quote-author" style={{ color: "var(--navy-light)" }}>— Thomas Depledge</div>
            </Reveal>
          </div>
        </div>
      </section>

      <section style={{ padding: "80px 0" }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <Reveal>
            <div className="eyebrow dark">Our Team</div>
            <h2 className="section-title">The People Behind<br /><em>The Work</em></h2>
            <p style={{ fontSize: 16, color: "var(--gray)", lineHeight: 1.75, marginBottom: 32 }}>
              Every member of our team is police-checked and committed to delivering quality work across the Copper Coast.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {TEAM.map((m) => (
                <div
                  key={m.name}
                  style={{
                    background: m.highlight ? "var(--navy)" : "var(--off)",
                    color: m.highlight ? "white" : "inherit",
                    borderRadius: 16,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: m.highlight ? "var(--lime)" : "var(--navy)" }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: m.highlight ? undefined : "var(--gray)", opacity: m.highlight ? 0.5 : 1, marginTop: 4 }}>
                    {m.role}
                  </div>
                </div>
              ))}
              {/* 3 empty "growing" slots — show one card visually that says we're hiring */}
              <div style={{ background: "var(--lime)", borderRadius: 16, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>We&apos;re Growing!</div>
                <div style={{ fontSize: 12, color: "var(--navy)", opacity: 0.7, marginTop: 4 }}>Join our team</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <BookCta
        eyebrow="Work With Us"
        title={<>Want the Same <em>Local</em><br />Touch?</>}
        lead="Get in touch — we'll quote your job honestly and get it done properly."
      />
    </>
  );
}
