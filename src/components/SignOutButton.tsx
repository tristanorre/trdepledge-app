"use client";

import { signOut } from "next-auth/react";

// `window.OneSignal` is declared in OneSignalRegister.tsx with the full
// API surface — we only need `logout()` here, which is part of that
// type, so no extra declaration is required.

export default function SignOutButton() {
  async function handleSignOut() {
    // Best-effort OneSignal external_user_id unbinding before the
    // NextAuth sign-out. Without this, push notifications targeted at
    // the just-signed-out user would still arrive on this device until
    // the next sign-in re-binds it (cross-user leak on shared phones).
    try { await window.OneSignal?.logout(); }
    catch (err) { console.error("[signout] OneSignal.logout", err); }
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
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
