import type { Metadata } from "next";
import Script from "next/script";
import { Anton, Barlow, Barlow_Condensed } from "next/font/google";

import { HIRE_PUBLIC_LAUNCH } from "@/lib/hire";
import "./hire.css";

// The hire page has its own typography — Anton for the condensed display
// caps, Barlow for body copy — separate from the gardening site's DM Sans.
// Loaded through next/font rather than the prototype's Google Fonts <link>
// so it's self-hosted and doesn't block render, matching the root layout.
const anton = Anton({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-anton",
  display: "swap",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DIY Tool Hire — Wallaroo SA",
  description:
    "Hire the tools and do it yourself. Cement mixer, post hole digger, demolition hammer, " +
    "wacker packer, lawn roller and mower — by the day, collected from Wallaroo SA. " +
    "Check live availability and book online.",
  alternates: { canonical: "/hire" },
  // Kept out of search results until launch — the bonds shown on the page
  // are still placeholders and nothing texts Thomas when a request lands.
  // Driven by one flag in src/lib/hire/config.ts; flip it there, not here.
  robots: HIRE_PUBLIC_LAUNCH
    ? undefined
    : { index: false, follow: false, nocache: true },
  openGraph: {
    title: "DIY Tool Hire — Wallaroo SA | T.R. Depledge",
    description:
      "The same gear Thomas uses on Copper Coast jobs, available by the day. " +
      "Check what's free on the calendar and lock in your dates.",
    url: "/hire",
    type: "website",
  },
};

/**
 * The `.hire-page` wrapper is load-bearing, not decorative: every rule in
 * hire.css is scoped under it so the black-and-lime palette can't leak into
 * the gardening site, which shares globals.css from the root layout.
 */
export default function HireLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`hire-page ${anton.variable} ${barlow.variable} ${barlowCondensed.variable}`}
    >
      {children}
      {/*
        Doug, behind the hire counter. Same widget and same endpoint as the
        marketing site — the server switches him into hire mode off the
        page path, so there is one bot and one conversation, not two.

        Two differences from the gardening pages, both deliberate:
          * No auto-open. This page IS the booking flow; a panel that
            covers the calendar unasked gets closed, not read.
          * A greeting that offers what he can actually do here.
      */}
      <Script
        id="doug-widget-hire"
        src="/embed.js"
        strategy="lazyOnload"
        data-endpoint="/api/enquiry"
        data-logo="/images/Doug.png"
        data-auto-open="false"
        data-greeting={
          "G'day — Doug here. Tell us what you're building and roughly when, " +
          "and I'll tell you what gear suits, what it costs and whether it's free. " +
          "I can fill the booking form in for you too."
        }
      />
    </div>
  );
}
