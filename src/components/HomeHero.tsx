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
// five on a 28s loop, staggered 5.6s apart so they don't bunch up.
// `delay` is applied as a NEGATIVE animationDelay, which means the
// walker appears mid-cycle on first paint instead of waiting at the
// off-screen-left position for its turn — the strip looks alive
// immediately on page load.
//
// `?v=N` cache-bust query: the PNG bytes have been updated in place
// (background removed) without changing the URL, so existing visitor
// browsers may still be serving the old white-bg version from cache.
// Bump the `v` whenever the source files are re-saved with the same
// filename.
const V = "2";
const WALKERS: Array<{ src: string; alt: string; delay: number }> = [
  { src: `/images/walkers/01-shovel.png?v=${V}`,       alt: "Thomas with a shovel",                           delay: 0 },
  { src: `/images/walkers/02-mower.png?v=${V}`,        alt: "Thomas pushing a mower",                         delay: 5.6 },
  { src: `/images/walkers/03-mower-doug.png?v=${V}`,   alt: "Thomas pushing a mower with Doug the galah",     delay: 11.2 },
  { src: `/images/walkers/04-hedge-doug.png?v=${V}`,   alt: "Thomas trimming a hedge while Doug watches",     delay: 16.8 },
  { src: `/images/walkers/05-blower-doug.png?v=${V}`,  alt: "Thomas using a leaf blower with Doug nearby",    delay: 22.4 },
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
        {/* The poster is a complete composition — its own headline,
            Doug, brand mark, service icons and tagline are all baked
            into the artwork. The previous speech bubble and the
            Thomas/30+ overlay cards were removed because they'd
            crowd or duplicate parts of the poster. */}
        <Image
          src="/images/hero-tr-poster.png"
          alt="T.R. Depledge Gardening & Maintenance — Thomas with Doug the galah, gardens that impress, maintenance you can trust"
          className="v16-hero-image"
          width={1122}
          height={1402}
          priority
        />
      </div>

      {/* Walker strip — row 2 of the hero grid. Each <img> carries the
          animation directly: a wrapper div would create a circular
          sizing dependency between `width: auto` on the wrapper and
          `height: 100%` on the img, causing figures to render at
          native PNG height (~1300px) instead of 180px. The browser's
          intrinsic-aspect-ratio sizing on <img> is reliable. */}
      <div className="v16-walker-strip" aria-hidden="true">
        {WALKERS.map((w) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={w.src}
            className="v16-walker"
            src={w.src}
            alt={w.alt}
            loading="lazy"
            style={{ animationDelay: `-${w.delay}s` }}
          />
        ))}
      </div>
    </section>
  );
}
