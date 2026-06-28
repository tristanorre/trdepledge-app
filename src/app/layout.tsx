import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display, Caveat } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-dm-serif-display",
  display: "swap",
});

// Caveat — handwriting accent. Used for v16's script "Maintenance" word,
// Doug's speech bubble, and Thomas's signature card. Swap-display so the
// page never blocks waiting for it.
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

// Root metadata is minimal — the marketing route group overrides everything
// for the public site, and /login + /admin + /worker set their own.
export const metadata: Metadata = {
  metadataBase: new URL("https://trdepledgegardeningandmaintenance.com"),
  title: {
    default: "T.R. Depledge Gardening & Maintenance",
    template: "%s | T.R. Depledge Gardening & Maintenance",
  },
  description:
    "T.R. Depledge Gardening & Maintenance — Wallaroo, Copper Coast SA.",
  icons: {
    // favicon.ico is multi-res (48/32/16) and renders the new
    // T.R. Depledge mark on the project navy. The legacy /logo.svg
    // reference was the old green wordmark — dropped so browsers
    // don't prefer the SVG over the up-to-date ICO.
    icon: [{ url: "/favicon.ico", sizes: "48x48 32x32 16x16" }],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0A1F3D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerifDisplay.variable} ${caveat.variable}`}>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
