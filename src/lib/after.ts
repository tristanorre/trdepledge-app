// Tiny adapter around Vercel's `waitUntil` so route handlers can dispatch
// fire-and-forget side effects (SMS, push, email) without losing them
// to the serverless function getting killed mid-flight.
//
// Why this matters: the app uses `void (async () => …)()` in several
// places to "send the SMS in the background and return 201 immediately."
// On Vercel, the function instance shuts down once the response stream
// is closed — anything still pending in the microtask queue is dropped.
// Real-world impact: the enquiries auto-reply SMS sometimes never
// reaches the customer, even though the server logged success.
//
// `waitUntil` (https://vercel.com/docs/functions/functions-api-reference)
// extends the instance lifetime up to the route's max-duration to let
// the promise resolve. Outside of Vercel (local dev, tests) it falls
// back to simply awaiting nothing — the original promise still runs
// because Node keeps the event loop alive while there's pending work.

import { waitUntil as vercelWaitUntil } from "@vercel/functions";

export function after(promise: Promise<unknown>): void {
  try {
    vercelWaitUntil(promise);
  } catch {
    // Outside Vercel (e.g. local dev, jest, playwright) the helper is a
    // no-op that throws "waitUntil is not available." Swallow it — the
    // promise still runs because we created it before this point.
    // Keep an unhandled-rejection guard so a thrown error in the
    // background work doesn't crash the dev server.
    promise.catch((err) => console.error("[after] background task failed", err));
  }
}
