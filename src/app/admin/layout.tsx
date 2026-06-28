import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import OneSignalRegister from "@/components/OneSignalRegister";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const ADMIN_NAV = [
  { href: "/admin",            label: "Dashboard" },
  { href: "/admin/jobs",       label: "Jobs" },
  { href: "/admin/schedule",   label: "Schedule" },
  { href: "/admin/time",       label: "Time" },
  { href: "/admin/hr",         label: "HR" },
  { href: "/admin/inventory",  label: "Inventory" },
  { href: "/admin/materials",  label: "Materials" },
  { href: "/admin/clients",    label: "Clients" },
  { href: "/admin/costs",      label: "Costs" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div style={shellStyle}>
      <header style={topBarStyle}>
        <Link href="/admin" style={logoLinkStyle}>
          <Image
            src="/images/logo-v16.png"
            alt="T.R. Depledge Gardening & Maintenance"
            width={800}
            height={800}
            priority
            // The v16 mark is square; the previous /logo.svg was a wide
            // green wordmark at 690×390. Rendering it at the same height
            // (36px) made the square badge look like a postage stamp, so
            // bump to 44px in the navy app top bar. Width auto-derives.
            style={{ height: 44, width: "auto" }}
          />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/admin/settings"
            style={{
              color: "rgba(255,255,255,0.65)", fontSize: 18,
              padding: "6px 10px", borderRadius: 8,
              minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </Link>
          <Link
            href="/admin/account"
            style={{
              fontSize: 13, color: "rgba(255,255,255,0.65)",
              padding: "6px 10px", borderRadius: 8,
              minHeight: 36, display: "inline-flex", alignItems: "center",
              textDecoration: "underline", textUnderlineOffset: "3px",
              textDecorationColor: "rgba(255,255,255,0.2)",
            }}
            title="Account"
          >
            {session.user.name}
          </Link>
          <SignOutButton />
        </div>
      </header>

      <OneSignalRegister userId={session.user.id} />

      <main style={mainStyle}>{children}</main>

      <nav style={bottomNavStyle} aria-label="Admin sections">
        {ADMIN_NAV.map((l) => (
          <Link key={l.href} href={l.href} style={bottomNavLinkStyle}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  background: "var(--off)",
};
const topBarStyle: React.CSSProperties = {
  background: "var(--navy)",
  color: "white",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  position: "sticky",
  top: 0,
  zIndex: 50,
};
const logoLinkStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center",
};
const mainStyle: React.CSSProperties = {
  flex: 1,
  padding: "24px 20px 96px", // bottom padding clears the fixed bottom nav
  maxWidth: 1200,
  width: "100%",
  margin: "0 auto",
};
const bottomNavStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0, left: 0, right: 0,
  background: "var(--navy)",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  display: "grid",
  gridTemplateColumns: "repeat(8, 1fr)",
  zIndex: 100,
};
const bottomNavLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.7)",
  fontSize: 10,
  fontWeight: 700,
  textAlign: "center",
  padding: "12px 2px",
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};
