import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <Image
            src="/images/logo-v16.png"
            alt="T.R. Depledge Gardening & Maintenance"
            width={1053}
            height={1052}
            priority
            style={{ width: "100%", maxWidth: 180, height: "auto" }}
          />
        </div>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--navy)", textAlign: "center", marginBottom: 8 }}>
          Forgot password?
        </h1>
        <p style={{ fontSize: 14, color: "var(--gray)", textAlign: "center", marginBottom: 24 }}>
          Enter the admin email address on file. We&apos;ll send a one-time link to set a new password.
        </p>

        <ForgotPasswordForm />

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <Link href="/login" style={{ fontSize: 13, color: "var(--lime)", textDecoration: "underline" }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  position: "fixed", inset: 0,
  background: "var(--navy)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 24, zIndex: 2000,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 20,
  padding: 36, boxShadow: "0 8px 48px rgba(0,0,0,0.4)",
  width: "100%", maxWidth: 400,
};
