"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

// v16 hero — the visual anchor of the marketing site.
//
// Sticky-tall yellow background, two-column layout, big headline with the
// word "Maintenance" set in Caveat (handwriting) at -2°, four trust badges,
// and a right-column photo of Thomas + Doug with overlay cards (speech
// bubble, signature card, "30+ regular clients" ribbon).
//
// The walker strip — five animated illustrations of Thomas at work that
// slide rightward and disappear behind the hero photo — is rendered here
// rather than as a sibling element, because it's an absolutely positioned
// child of `.v16-hero` and needs to sit below the hero photo's z-index.

const TOWNS = ["Wallaroo's", "Kadina's", "Moonta's"] as const;

// Walker images live in /public/images/walkers/. The strip cycles all
// five on a 32s loop, staggered so they don't bunch up. If a walker
// file is missing, Next.js serves a 404 image and the slot animates an
// empty rectangle — visually quiet but not a layout break.
const WALKERS: Array<{ src: string; alt: string; delay: number }> = [
  { src: "/images/walkers/01-shovel.png",       alt: "Thomas with a shovel",                           delay: 0 },
  { src: "/images/walkers/02-mower.png",        alt: "Thomas pushing a mower",                         delay: 6.4 },
  { src: "/images/walkers/03-mower-doug.png",   alt: "Thomas pushing a mower with Doug the galah",     delay: 12.8 },
  { src: "/images/walkers/04-hedge-doug.png",   alt: "Thomas trimming a hedge while Doug watches",     delay: 19.2 },
  { src: "/images/walkers/05-blower-doug.png",  alt: "Thomas using a leaf blower with Doug nearby",    delay: 25.6 },
];

export default function HomeHero() {
  const [townIdx, setTownIdx] = useState(0);
  const [fading, setFading] = useState(false);

  // Town rotator — fade-out, swap word, fade-in. 2.5s dwell + 0.4s fade
  // matches v16's mock pacing exactly.
  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      const swap = setTimeout(() => {
        setTownIdx((i) => (i + 1) % TOWNS.length);
        setFading(false);
      }, 400);
      return () => clearTimeout(swap);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="v16-hero">
      <div className="v16-hero-left">
        <span className="v16-eyebrow">
          <span className="v16-eyebrow-stroke" aria-hidden="true" />
          <span className={`v16-rotate-town${fading ? " fading" : ""}`}>
            {TOWNS[townIdx]}
          </span>
          {" "}Trusted
          <span className="v16-eyebrow-stroke" aria-hidden="true" />
        </span>

        <h1 className="v16-headline">
          <span className="v16-h-big">Garden &amp;</span>
          <span className="v16-h-script">Maintenance</span>
          <span className="v16-h-big">Experts.</span>
        </h1>

        <p className="v16-desc">
          Across Wallaroo, Kadina, Moonta and the full Yorke Peninsula. Honest,
          hardworking gardening and outdoor maintenance — done properly, by a
          team that actually turns up.
        </p>

        <div className="v16-actions">
          <Link className="v16-btn v16-btn-primary" href="/contact">
            <span className="v16-btn-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </span>
            Get a Quote
          </Link>
          <Link className="v16-btn v16-btn-secondary" href="/gallery">
            <span className="v16-btn-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </span>
            See Our Work
          </Link>
        </div>

        <div className="v16-trustline">
          <div className="v16-trust-item">
            <span className="v16-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
            </span>
            Local &amp;<br />Reliable
          </div>
          <div className="v16-trust-divider" aria-hidden="true" />
          <div className="v16-trust-item">
            <span className="v16-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" /></svg>
            </span>
            Police<br />Checked
          </div>
          <div className="v16-trust-divider" aria-hidden="true" />
          <div className="v16-trust-item">
            <span className="v16-trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6l-8-4zm-1 15l-4-4 1.4-1.4L11 14.2l5.6-5.6L18 10l-7 7z" /></svg>
            </span>
            Fully<br />Insured
          </div>
          <div className="v16-trust-divider" aria-hidden="true" />
          <div className="v16-trust-item">
            <span className="v16-trust-icon v16-trust-icon-ndis" aria-hidden="true">ndis</span>
            NDIS<br />Approved
          </div>
        </div>
      </div>

      <div className="v16-hero-right">
        <Image
          src="/images/hero-thomas-doug.png"
          alt="Thomas Depledge with Doug the galah"
          className="v16-hero-image"
          width={900}
          height={1100}
          priority
        />

        <div className="v16-doug-bubble" aria-hidden="true">
          <div className="v16-doug-bubble-text">G&apos;day! I&apos;m Doug —<br />Thomas does the<br />gardening, I supervise.</div>
          <div className="v16-doug-bubble-from">— Doug the galah</div>
        </div>

        <div className="v16-right-stack" aria-hidden="true">
          <div className="v16-sig-card">
            <div className="v16-sig-name">Thomas Depledge</div>
            <div className="v16-sig-role">Owner · Wallaroo SA</div>
          </div>
          <div className="v16-stat-ribbon">
            <span className="v16-stat-leaf">
              <svg viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3 7 0 12-7 12-12 0-1.31-.21-2.55-.58-3.7C19.65 5.85 19 7 17 8z" /></svg>
            </span>
            <div>
              <div className="v16-stat-num">30+</div>
              <div className="v16-stat-label">Regular clients</div>
            </div>
          </div>
        </div>
      </div>

      {/* Walker strip — absolutely positioned at the bottom of the hero,
          z-index below the hero photo so figures appear to walk behind
          Thomas + Doug as they exit stage right. */}
      <div className="v16-walker-strip" aria-hidden="true">
        <div className="v16-walker-track">
          {WALKERS.map((w) => (
            <div
              key={w.src}
              className="v16-walker"
              style={{ animationDelay: `-${w.delay}s` }}
            >
              {/* Plain <img>, not next/image, because each instance
                  needs CSS `height: 100%` of the strip and we don't
                  benefit from intrinsic-size optimisation here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.src} alt={w.alt} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
