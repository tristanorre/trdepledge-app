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
                src="/logo.svg"
                alt="T.R. Depledge Gardening & Maintenance"
                width={690}
                height={390}
              />
            </div>
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
              <li><Link href="/ndis-aged-care">NDIS & Aged Care</Link></li>
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/gallery">Gallery</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-title">Services</div>
            <ul className="footer-links">
              <li><Link href="/services">Garden Maintenance</Link></li>
              <li><Link href="/services">Instant Lawn Installs</Link></li>
              <li><Link href="/services">Yard Revamps</Link></li>
              <li><Link href="/services">Landscaping</Link></li>
              <li><Link href="/ndis-aged-care">NDIS Support</Link></li>
              <li><Link href="/ndis-aged-care">Aged Care</Link></li>
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
          </div>
        </div>
      </div>
    </footer>
  );
}
