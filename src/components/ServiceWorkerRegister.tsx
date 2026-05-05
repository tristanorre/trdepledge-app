"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js for both PWA install eligibility and OneSignal
 * push delivery (our SW imports OneSignal's at the top).
 *
 * No-ops on browsers without service worker support, and never throws —
 * if registration fails, the app still works, you just lose offline
 * caching and pushes.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      // SW only runs over HTTPS or on localhost.
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("[sw] register failed", err));
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}
