"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/ndis-aged-care", label: "NDIS & Aged Care" },
  { href: "/about", label: "About Us" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
];

export default function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <>
      <nav className={`nav${scrolled ? " scrolled" : ""}`} id="nav">
        <div className="container">
          <div className="nav-inner">
            <Link className="nav-logo" href="/" aria-label="T.R. Depledge home">
              <Image
                src="/logo.svg"
                alt="T.R. Depledge Gardening & Maintenance"
                width={690}
                height={390}
                priority
              />
            </Link>

            <ul className="nav-links">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={pathname === l.href ? "active" : ""}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="tel:0474844204" className="nav-phone">
                  📞 0474 844 204
                </a>
              </li>
              <li>
                <Link href="/contact" className="nav-cta">Book Now</Link>
              </li>
            </ul>

            <button
              className="hamburger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </nav>

      <div
        className={`mobile-menu${menuOpen ? " open" : ""}`}
        style={{ display: menuOpen ? "flex" : undefined }}
      >
        {links.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        <a href="tel:0474844204">📞 0474 844 204</a>
        <Link href="/contact" className="mob-cta">Book a Job →</Link>
      </div>
    </>
  );
}
