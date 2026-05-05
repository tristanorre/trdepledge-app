"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        background: "transparent",
        color: "var(--lime)",
        border: "1px solid rgba(168,216,24,0.4)",
        borderRadius: 8,
        padding: "8px 14px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        minHeight: 36,
      }}
    >
      Sign out
    </button>
  );
}
