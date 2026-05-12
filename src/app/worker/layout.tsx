import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireWorker } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import OneSignalRegister from "@/components/OneSignalRegister";

export const metadata: Metadata = {
  title: "My Day",
  robots: { index: false, follow: false },
};

const WORKER_NAV = [
  { href: "/worker",          label: "My Jobs" },
  { href: "/worker/schedule", label: "Schedule" },
  { href: "/worker/hours",    label: "Hours" },
  { href: "/worker/leave",    label: "Leave" },
];

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireWorker();

  return (
    <div style={shellStyle}>
      <header style={topBarStyle}>
        <Link href="/worker" style={{ display: "inline-flex", alignItems: "center" }}>
          <Image
            src="/images/logo-v16.png"
            alt="T.R. Depledge Gardening & Maintenance"
            width={1053}
            height={1052}
            priority
            // v16 mark is square; bump height to 44px so the navy
            // badge reads cleanly at thumbnail size on the worker
            // top bar. Width auto-derives from the aspect ratio.
            style={{ height: 44, width: "auto" }}
          />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/worker/account"
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

      <nav style={bottomNavStyle} aria-label="Worker sections">
        {WORKER_NAV.map((l) => (
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
const mainStyle: React.CSSProperties = {
  flex: 1,
  padding: "24px 20px 96px",
  maxWidth: 760,
  width: "100%",
  margin: "0 auto",
};
const bottomNavStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0, left: 0, right: 0,
  background: "var(--navy)",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  zIndex: 100,
};
const bottomNavLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.7)",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "center",
  padding: "16px 4px",
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};
