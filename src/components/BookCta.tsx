import Link from "next/link";
import Reveal from "@/components/Reveal";

// Navy "Book a Job" band that sits above the footer on every marketing
// page (except NDIS, which has its own enquiry CTA tuned to the
// participant flow). Lifted from the homepage so the v16 yellow→off-white
// →navy rhythm carries across the site rather than stopping after the
// hero on each page.
type Props = {
  eyebrow?: string;
  title?: React.ReactNode;
  lead?: string;
  primaryHref?: string;
  primaryLabel?: string;
};

const PAYMENT_METHODS = ["Visa", "Mastercard", "Apple Pay", "Google Pay", "Afterpay", "EFTPOS"];

export default function BookCta({
  eyebrow = "Get Started Today",
  title = (
    <>
      Ready for a <em>Better</em>
      <br />
      Garden?
    </>
  ),
  lead = "Book online or give Thomas a call. We'll get your garden sorted — professionally, reliably, and at a fair price.",
  primaryHref = "/contact",
  primaryLabel = "Book Online Now →",
}: Props) {
  return (
    <section className="book-section">
      <div className="container">
        <div className="book-inner">
          <Reveal className="eyebrow" style={{ justifyContent: "center", color: "var(--lime)" }}>
            {eyebrow}
          </Reveal>
          <Reveal as="h2" className="section-title light">
            {title}
          </Reveal>
          <Reveal as="p" className="section-lead light" style={{ margin: "0 auto" }}>
            {lead}
          </Reveal>
          <Reveal className="book-actions">
            <Link href={primaryHref} className="btn btn-primary btn-lg">
              {primaryLabel}
            </Link>
            <a href="tel:0474844204" className="btn btn-secondary btn-lg">
              📞 0474 844 204
            </a>
          </Reveal>
          <Reveal className="book-payment-methods">
            {PAYMENT_METHODS.map((p) => (
              <span key={p} className="payment-pill">
                {p}
              </span>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
