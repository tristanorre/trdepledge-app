import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "T.R. Depledge staff sign-in.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div style={shellStyle}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--navy)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 2000, // sit above the global Nav from layout.tsx
};
