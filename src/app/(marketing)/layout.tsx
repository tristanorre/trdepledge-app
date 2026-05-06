import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ScrollTop from "@/components/ScrollTop";
// v16 visual system — yellow hero, lime accents, Caveat handwriting.
// Only loaded inside the marketing route group, so the field-app and
// admin/worker routes don't pay for these styles.
import "@/app/v16.css";

// Marketing-specific metadata. Pages override `title` and `description`.
export const metadata: Metadata = {
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
    url: "https://trdepledgegardeningandmaintenance.com",
    siteName: "T.R. Depledge Gardening & Maintenance",
    locale: "en_AU",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
      <ScrollTop />
    </>
  );
}
