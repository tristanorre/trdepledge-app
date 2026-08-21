import type { Metadata } from "next";
import Script from "next/script";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ScrollTop from "@/components/ScrollTop";
// v16 visual system — yellow hero, lime accents, Caveat handwriting.
// Only loaded inside the marketing route group, so the field-app and
// admin/worker routes don't pay for these styles.
import "@/app/v16.css";

// Marketing-specific metadata. Pages override `title` and `description`.
export const metadata: Metadata = {
  // metadataBase lets Next resolve relative og/twitter image paths and emit a
  // per-page canonical + og:url. Without it every page shared the homepage URL
  // and no image at all, so link previews on Facebook/WhatsApp rendered blank.
  metadataBase: new URL("https://trdepledgegardeningandmaintenance.com"),
  alternates: { canonical: "./" },
  title: {
    default: "T.R. Depledge Gardening & Maintenance | Wallaroo · Copper Coast SA",
    template: "%s | T.R. Depledge Gardening & Maintenance",
  },
  description:
    "Trustworthy, hardworking and local. T.R. Depledge Gardening & Maintenance services Wallaroo, Kadina, Moonta and the Copper Coast. NDIS & Aged Care approved. Call 0474 844 204.",
  keywords: [
    "gardening Wallaroo", "gardening Kadina", "gardening Moonta",
    "Copper Coast gardening", "Yorke Peninsula gardening",
    "NDIS garden support SA", "aged care gardening",
    "lawn mowing Copper Coast", "landscaping Wallaroo",
  ],
  openGraph: {
    title: "T.R. Depledge Gardening & Maintenance",
    description:
      "Wallaroo's trusted garden & maintenance experts. Police-checked, NDIS & Aged Care approved.",
    // No explicit `url` — Next derives it per page from metadataBase, so a
    // shared /services link no longer claims to be the homepage.
    siteName: "T.R. Depledge Gardening & Maintenance",
    locale: "en_AU",
    type: "website",
    images: [
      {
        url: "/images/hero-tr-poster.png",
        width: 1200,
        height: 630,
        alt: "Thomas from T.R. Depledge Gardening & Maintenance with Doug the galah",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "T.R. Depledge Gardening & Maintenance",
    description:
      "Wallaroo's trusted garden & maintenance experts. Police-checked, NDIS & Aged Care approved.",
    images: ["/images/hero-tr-poster.png"],
  },
};

// LocalBusiness structured data. For a local trade this is the single
// biggest technical SEO lever — it is what feeds the Google map pack, which
// is where the phone calls come from. Hours here MUST match the contact page
// and the Google Business Profile; a mismatch gets the profile flagged.
//
// Deliberately omits aggregateRating: Google requires ratings to be
// genuinely collected and displayed on the page, and inventing one is both a
// policy breach and a manual-action risk. Add it once real reviews are shown.
const LOCAL_BUSINESS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "T.R. Depledge Gardening & Maintenance",
  description:
    "Gardening, lawn mowing, landscaping and outdoor maintenance across Wallaroo, Kadina, Moonta and the Copper Coast. NDIS and Aged Care approved, police-checked staff.",
  url: "https://trdepledgegardeningandmaintenance.com",
  telephone: "+61474844204",
  email: "t.rdepledge@outlook.com",
  image: "https://trdepledgegardeningandmaintenance.com/images/hero-tr-poster.png",
  foundingDate: "2020-11-30",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Wallaroo",
    addressRegion: "SA",
    addressCountry: "AU",
  },
  areaServed: [
    "Wallaroo", "Kadina", "Moonta", "Moonta Bay",
    "Copper Coast", "Yorke Peninsula",
  ].map((name) => ({ "@type": "Place", name })),
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "07:00",
      closes: "17:00",
    },
  ],
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_JSONLD) }}
      />
      <Nav />
      <main>{children}</main>
      <Footer />
      <ScrollTop />
      {/*
        Doug — the site chatbot. Widget lives in /public/embed.js,
        talks only to /api/enquiry (same-origin). Loaded lazily so
        first-paint isn't blocked. Only appears on marketing pages —
        this layout wraps the (marketing) route group, so /admin
        and /worker never render it.
      */}
      <Script
        id="doug-widget"
        src="/embed.js"
        strategy="lazyOnload"
        data-endpoint="/api/enquiry"
        data-logo="/images/Doug.png"
      />
    </>
  );
}
