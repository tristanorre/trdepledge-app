import type { Metadata } from "next";
import { Anton, Barlow, Barlow_Condensed } from "next/font/google";

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
    </div>
  );
}
