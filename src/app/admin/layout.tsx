import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import OneSignalRegister from "@/components/OneSignalRegister";
import AdminNav from "@/components/AdminNav";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Admin shell:
//   [ Header top bar (full width) ]
//   [ Left sidebar ][ Main content ]      ← desktop
//   [ Main content, bottom nav ]          ← mobile
// The sidebar / bottom-nav swap lives in AdminNav + globals.css media
// queries. Auth (requireAdmin) still runs server-side here.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="admin-shell">
      <header style={topBarStyle}>
        <Link href="/admin" style={logoLinkStyle}>
          <Image
            src="/images/logo-v16.png"
            alt="T.R. Depledge Gardening & Maintenance"
            width={800}
            height={800}
            priority
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

      <div className="admin-body">
        <AdminNav />
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}

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
