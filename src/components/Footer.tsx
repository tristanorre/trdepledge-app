import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer id="siteFooter">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logo">
              <Image
                src="/images/logo-v16.png"
                alt="T.R. Depledge Gardening & Maintenance"
                width={1053}
                height={1052}
              />
            </div>
            {/* Caveat-script flourish — small v16 cue carried through to the footer. */}
            <div className="footer-flourish">From Wallaroo, with care.</div>
            <p className="footer-desc">
              Proudly local, supporting locals, employing locals. Serving Wallaroo, Kadina, Moonta and the Copper Coast since 2020.
            </p>
            <div className="footer-social">
              {/* Facebook icon removed — there is no public TRD page yet, and a
                  link to facebook.com root is worse than no link (looks like
                  a stub, hurts trust). Restore once a real Page URL exists. */}
              <a href="mailto:t.rdepledge@outlook.com" className="social-btn" title="Email">✉</a>
              <a href="tel:0474844204" className="social-btn" title="Call">📞</a>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Pages</div>
            <ul className="footer-links">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/services">Services</Link></li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/gallery">Our Work</Link></li>
              <li><Link href="/ndis-aged-care">NDIS & Aged Care</Link></li>
              <li><Link href="/reviews">Reviews</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-title">Services</div>
            {/* Canonical 10-item service list — same order and names
                as the homepage preview and /services tiles. Each
                points at /contact?service=… via the existing pattern
                so the dropdown pre-fills. */}
            <ul className="footer-links">
              <li><Link href="/contact?service=Garden%20Maintenance">Lawn mowing & edging</Link></li>
              <li><Link href="/contact?service=Garden%20Maintenance">Garden maintenance</Link></li>
              <li><Link href="/contact?service=Hedge%20%26%20Tree%20Trimming">Hedge & small tree trimming</Link></li>
              <li><Link href="/contact?service=Garden%20Clean-Up">Garden clean-ups</Link></li>
              <li><Link href="/contact?service=Yard%20Revamp">Yard revamps</Link></li>
              <li><Link href="/contact?service=Landscaping">Landscaping</Link></li>
              <li><Link href="/contact?service=Instant%20Lawn%20Install">Instant lawn installs</Link></li>
              <li><Link href="/contact?service=NDIS%20Garden%20Support">NDIS yard maintenance</Link></li>
              <li><Link href="/contact?service=Aged%20Care%20Services">Aged care garden support</Link></li>
              <li><Link href="/contact?service=Gift%20Card%20Enquiry">Gift cards</Link></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-title">Contact</div>
            <div className="footer-contact-item">📞 <a href="tel:0474844204">0474 844 204</a></div>
            <div className="footer-contact-item">✉️ <a href="mailto:t.rdepledge@outlook.com">t.rdepledge@outlook.com</a></div>
            <div className="footer-contact-item">📍 Wallaroo, SA · Copper Coast & Yorke Peninsula</div>
            <div style={{ marginTop: 20 }}>
              <div className="footer-col-title">Areas</div>
              <ul className="footer-links">
                <li><span>Wallaroo</span></li>
                <li><span>Kadina · Moonta</span></li>
                <li><span>Moonta Bay</span></li>
                <li><span>Copper Coast</span></li>
                <li><span>Yorke Peninsula</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} T.R. Depledge Gardening & Maintenance · ABN registered 30 November 2020</div>
          <div className="footer-bottom-links">
            <Link href="/contact">Book Online</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
