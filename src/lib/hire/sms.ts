// SMS copy for DIY Hire. Two messages, both triggered by something that
// already succeeded:
//
//   1. A booking request lands  → text Thomas, so he knows to answer it
//   2. Thomas confirms it       → text the customer, so they know it's on
//
// Pure string builders, kept out of the routes so the wording is
// unit-testable and lives in one place. Nothing here talks to Twilio.
//
// LENGTH MATTERS. A GSM-7 segment is 160 characters, and anything with a
// non-GSM character (curly quotes, en dashes, emoji) drops the whole
// message to 70-character UCS-2 segments. These are written to land in two
// GSM segments, and the tests hold that line — a stray “smart quote” from
// a copy edit would silently triple the cost of every message.

import { fmtHireDate } from "./dates";
import { fmtHireMoney } from "./charging";
import { HIRE_PHONE } from "./config";
import type { ISODate } from "./dates";

/** Comfortable ceiling: two GSM-7 segments. */
export const SMS_SOFT_LIMIT = 320;

/**
 * Characters outside the GSM-7 alphabet force UCS-2 encoding, which cuts
 * the segment size from 160 to 70. The usual offenders are the ones a text
 * editor inserts on your behalf.
 */
const NON_GSM = /[^\r\nA-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€ ]/;

/** True when the message would be billed as expensive UCS-2 segments. */
export function forcesUnicode(message: string): boolean {
  return NON_GSM.test(message);
}

export type BookingSmsContext = {
  reference: string;
  customerName: string;
  customerPhone: string;
  equipmentName: string;
  startsOn: ISODate;
  endsOn: ISODate;
  totalDueAtPickupCents: number;
  /**
   * True when Thomas isn't taking a bond on this hire. Only changes the
   * customer's message — it tells them not to bring a card for it, which
   * is the one practical difference at the counter.
   */
  bondWaived?: boolean;
};

/**
 * To Thomas, the moment a request arrives.
 *
 * He's the one who has to act, so it leads with what and who, and ends
 * with the link that takes him straight to the queue. Deliberately no
 * "please" or padding — this arrives while he's on a job.
 */
export function newRequestForThomas(
  ctx: BookingSmsContext,
  adminUrl: string,
): string {
  return [
    `New hire request: ${ctx.equipmentName}.`,
    `${ctx.customerName}, ${ctx.customerPhone}.`,
    `${fmtHireDate(ctx.startsOn)} to ${fmtHireDate(ctx.endsOn)}.`,
    `${fmtHireMoney(ctx.totalDueAtPickupCents)} at pickup.`,
    `Ref ${ctx.reference}.`,
    adminUrl,
  ].join(" ");
}

/**
 * To the customer, once Thomas confirms.
 *
 * Everything they need at the counter: what, when, how much, what to
 * bring. The spec is explicit that this only goes out on confirmation —
 * a request is not a booking, and the copy must not blur that.
 */
export function confirmedForCustomer(ctx: BookingSmsContext): string {
  const firstName = ctx.customerName.trim().split(/\s+/)[0] || "there";
  // Photo ID is asked for either way — it's an ID check, not a bond
  // condition. Only the card line goes, because that's the sentence that
  // would otherwise send someone hunting for a card they don't need.
  const bringLine = ctx.bondWaived
    ? "at pickup, no bond on this one - just bring photo ID."
    : "at pickup - bring photo ID and a card for the bond.";
  return [
    `Hi ${firstName}, your ${ctx.equipmentName} hire is confirmed.`,
    `Collect ${fmtHireDate(ctx.startsOn)}, back by ${fmtHireDate(ctx.endsOn)}.`,
    `${fmtHireMoney(ctx.totalDueAtPickupCents)} ${bringLine}`,
    `Ref ${ctx.reference}.`,
    `T.R. Depledge ${HIRE_PHONE}`,
  ].join(" ");
}

/**
 * Where Thomas's notification points.
 *
 * Straight to the bookings queue rather than the dashboard: he's opening
 * this because something needs answering.
 */
export function adminBookingsUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "").replace(
    /\/$/,
    "",
  );
  return base ? `${base}/admin/hire/bookings` : "/admin/hire/bookings";
}

/**
 * Who gets told when a request lands.
 *
 * `HIRE_NOTIFY_MOBILE` mirrors the existing `ENQUIRY_NOTIFY_EMAIL`
 * convention. It falls back to the number printed on the flyers, which is
 * almost certainly Thomas's mobile — but "almost certainly" is why the
 * booking SMS recipient is on the pre-launch checklist. Set the env var to
 * be sure.
 */
export function hireNotifyMobile(): string {
  return process.env.HIRE_NOTIFY_MOBILE?.trim() || HIRE_PHONE;
}
