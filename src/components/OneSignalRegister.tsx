"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalApi) => void>;
    OneSignal?: OneSignalApi;
  }
}

type OneSignalApi = {
  init: (opts: { appId: string; allowLocalhostAsSecureOrigin?: boolean; safari_web_id?: string }) => Promise<unknown>;
  login: (externalId: string) => Promise<unknown>;
  logout: () => Promise<unknown>;
  Notifications: {
    requestPermission: () => Promise<unknown>;
  };
};

type Props = {
  userId: string;
};

/**
 * Wires the current logged-in user's UUID to OneSignal as an
 * `external_user_id`. The server-side push helper then targets users
 * by app UUID rather than per-device player IDs — so a user with two
 * devices receives the same notification on both, and a fresh device
 * on the same login gets pushes immediately.
 *
 * Renders nothing. Loading the SDK script is idempotent: it only
 * appends the <script> on first mount.
 */
export default function OneSignalRegister({ userId }: Props) {
  const initialised = useRef(false);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return; // graceful no-op when push isn't configured

    if (initialised.current) {
      // userId may have changed (sign-out → sign-in as another user)
      window.OneSignal?.login(userId).catch((e) => console.error("[onesignal] login", e));
      return;
    }
    initialised.current = true;

    // OneSignal v16: if the SDK script isn't loaded yet, push initialiser
    // callbacks into OneSignalDeferred — the script picks them up when
    // it finishes loading.
    window.OneSignalDeferred = window.OneSignalDeferred ?? [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId,
          allowLocalhostAsSecureOrigin: true,
        });
        await OneSignal.login(userId);
      } catch (err) {
        console.error("[onesignal] init/login failed", err);
      }
    });

    // Inject the SDK script if not already present.
    const SCRIPT_ID = "onesignal-sdk";
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, [userId]);

  return null;
}
