import type { Metadata } from "next";
import ContactForm, { isServiceOption } from "@/components/ContactForm";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with T.R. Depledge Gardening & Maintenance. Call 0474 844 204 or send us a message — we'll get back to you within 1 business day.",
};

// Reading `searchParams` here opts the page out of static prerender, but
// the form is what people actually come for — pre-filling its dropdown
// server-side is worth a per-request render. The trade is a Suspense
// boundary on a client component using `useSearchParams`, which strips
// the form from the static HTML entirely.
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.service) ? params.service[0] : params.service ?? "";
  const initialService = isServiceOption(raw) ? raw : "";

  return (
    <>
      <section className="contact-hero">
        <div className="container">
          <div className="eyebrow" style={{ justifyContent: "center" }}>Get In Touch</div>
          <h1 className="section-title light" style={{ marginBottom: 16 }}>
            Book a Job or<br /><em>Get a Quote</em>
          </h1>
          <p className="section-lead light" style={{ margin: "0 auto" }}>
            Fill in the form and Thomas will get back to you promptly. Or give us a call — we love a chat.
          </p>
        </div>
      </section>

      <section className="contact-body" style={{ background: "var(--off)" }}>
        <div className="container">
          <div className="contact-layout">
            <Reveal className="contact-form-wrap">
              <div className="form-title">Send Us a Message</div>
              <div className="form-sub">We&apos;ll get back to you within 1 business day.</div>
              <ContactForm initialService={initialService} />
            </Reveal>

            <div className="contact-info-side">
              <Reveal delay={1} className="contact-info-card">
                <div className="contact-info-title">Contact Details</div>

                <div className="ci-item">
                  <div className="ci-icon">📞</div>
                  <div>
                    <div className="ci-label">Phone</div>
                    <div className="ci-value"><a href="tel:0474844204">0474 844 204</a></div>
                    <div className="ci-sub">Call or text Thomas directly</div>
                  </div>
                </div>

                <div className="ci-item">
                  <div className="ci-icon">✉️</div>
                  <div>
                    <div className="ci-label">Email</div>
                    <div className="ci-value"><a href="mailto:t.rdepledge@outlook.com">t.rdepledge@outlook.com</a></div>
                  </div>
                </div>

                <div className="ci-item">
                  <div className="ci-icon">📍</div>
                  <div>
                    <div className="ci-label">Service Area</div>
                    <div className="ci-value">Copper Coast & Yorke Peninsula</div>
                    <div className="ci-sub">Wallaroo · Kadina · Moonta & surrounds</div>
                  </div>
                </div>

                <div className="ci-item">
                  <div className="ci-icon">🌐</div>
                  <div>
                    <div className="ci-label">Website</div>
                    <div className="ci-value"><span>trdepledgegardeningandmaintenance.com</span></div>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={2} className="hours-card">
                <div className="hours-title">⏰ Operating Hours</div>
                <div className="hours-row"><span className="day">Monday – Friday</span><span>7:00am – 5:00pm</span></div>
                <div className="hours-row"><span className="day">Saturday</span><span>7:00am – 12:00pm</span></div>
                <div className="hours-row"><span className="day">Sunday</span><span>By arrangement</span></div>
                <div style={{ fontSize: 12, color: "var(--navy)", opacity: 0.6, marginTop: 12 }}>
                  Emergency or urgent jobs — please call directly.
                </div>
              </Reveal>

              <Reveal delay={3} style={{ background: "var(--off)", borderRadius: 16, padding: 24, marginTop: 20 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy)", marginBottom: 12 }}>We Accept</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["Visa", "Mastercard", "Apple Pay", "Google Pay", "Afterpay", "EFTPOS", "Bank Transfer"].map((p) => (
                    <span key={p} className="payment-pill" style={{ background: "var(--navy)", color: "white" }}>{p}</span>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
