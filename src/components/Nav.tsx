"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Marketing nav — v16 design. Tall navy bar (110px), centred uppercase
// links, and a phone widget pinned to the right. The logo lives in a
// 280px-wide slot but its image extends downward past the nav baseline
// so it sits visually anchored against the yellow hero below — that
// overhang is the v16 signature move.
//
// "Our Work" links to /gallery (existing). "Reviews" routes to a stub
// (added in this branch) so the link isn't broken.
const links: Array<{ href: string; label: string }> = [
  { href: "/",              label: "Home" },
  { href: "/services",      label: "Services" },
  { href: "/about",         label: "About" },
  { href: "/gallery",       label: "Our Work" },
  { href: "/ndis-aged-care", label: "NDIS & Aged Care" },
  { href: "/reviews",       label: "Reviews" },
  { href: "/contact",       label: "Contact" },
];

export default function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on route change so navigation doesn't trap users.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <>
      <nav className="v16-nav" aria-label="Primary">
        <Link href="/" className="v16-logo-slot" aria-label="T.R. Depledge home">
          <Image
            src="/logo.svg"
            alt="T.R. Depledge Gardening & Maintenance"
            className="v16-logo-img"
            width={690}
            height={390}
            priority
          />
        </Link>

        <ul className="v16-navlinks">
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
        </ul>

        <a href="tel:0474844204" className="v16-phone" aria-label="Call Thomas on 0474 844 204">
          <span className="v16-phone-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
          <span className="v16-phone-text">
            <span className="v16-phone-num">0474 844 204</span>
            <span className="v16-phone-sub">CALL THOMAS TODAY</span>
          </span>
        </a>

        <button
          type="button"
          className="v16-hamburger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span /><span /><span />
        </button>
      </nav>

      <div className={`v16-mobile-menu${menuOpen ? " is-open" : ""}`} role="menu">
        {links.map((l) => (
          <Link key={l.href} href={l.href} role="menuitem">{l.label}</Link>
        ))}
      </div>
    </>
  );
}
