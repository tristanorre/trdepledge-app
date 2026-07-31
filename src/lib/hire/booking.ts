// Booking request validation and reference generation.
//
// Pure — no database, no network — so the form and the API route import the
// SAME rules. The browser validates to give an instant, friendly answer; the
// server validates because the browser cannot be trusted. Sharing the module
// means the two can't drift into disagreeing about what a valid mobile is.
//
// Messages are written as a next step, in the page's voice:
//
//   "Nearly there — add your name, check your email address."
//
// not "Invalid input". A customer who mistyped an email should be told what
// to do about it.

import { isISODate, type ISODate } from "./dates";

/** What the form sends. Everything is untrusted until it's been through `validateBooking`. */
export type BookingInput = {
  slug: string;
  startsOn: string;
  endsOn: string;
  name: string;
  phone: string;
  email: string;
  jobNotes?: string;
  acceptedTerms: boolean;
};

/** Per-field caps. Generous for a human, tight enough that a bot can't dump a novel into the row. */
export const MAX_LENGTH = {
  name: 120,
  phone: 32,
  email: 200,
  jobNotes: 1000,
} as const;

// Deliberately loose, matching the prototype. Australian mobiles get written
// as "0400 000 000", "+61 400 000 000" and "(08) 8821 0000"; a strict pattern
// rejects real customers, and Thomas rings the number anyway.
const PHONE_RE = /^[0-9 +()-]{8,}$/;

// Also deliberately loose. Full RFC 5322 validation rejects addresses that
// work and accepts ones that don't; the only real check is whether the text
// arrives.
const EMAIL_RE = /^\S+@\S+\.\S+$/;

export type BookingProblem =
  | "dates"
  | "name"
  | "phone"
  | "email"
  | "terms"
  | "equipment";

/** Human phrasing for each problem, as the tail of "Nearly there — …". */
const PROBLEM_PHRASES: Record<BookingProblem, string> = {
  dates: "pick your collect and return dates",
  name: "add your name",
  phone: "add a mobile we can text",
  email: "check your email address",
  terms: "tick the ID and terms box",
  equipment: "choose which tool you want",
};

export type BookingValidation =
  | { ok: true; value: CleanBooking }
  | { ok: false; problems: BookingProblem[]; message: string };

/** A validated booking request. Still not authorised — availability is checked separately. */
export type CleanBooking = {
  slug: string;
  startsOn: ISODate;
  endsOn: ISODate;
  name: string;
  phone: string;
  email: string;
  jobNotes: string | null;
};

const trim = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

/**
 * Check a booking request's shape.
 *
 * Reports EVERY problem at once rather than stopping at the first — being
 * told about your email only after fixing your phone is the thing this
 * avoids. Availability is not checked here: that's `checkHireRange`, which
 * needs the diary.
 */
export function validateBooking(input: Partial<BookingInput>): BookingValidation {
  const slug = trim(input.slug, 80);
  const name = trim(input.name, MAX_LENGTH.name);
  const phone = trim(input.phone, MAX_LENGTH.phone);
  const email = trim(input.email, MAX_LENGTH.email);
  const jobNotes = trim(input.jobNotes, MAX_LENGTH.jobNotes);
  const startsOn = trim(input.startsOn, 10);
  const endsOn = trim(input.endsOn, 10);

  const problems: BookingProblem[] = [];

  if (!slug) problems.push("equipment");
  if (!isISODate(startsOn) || !isISODate(endsOn) || endsOn < startsOn) problems.push("dates");
  if (!name) problems.push("name");
  if (!PHONE_RE.test(phone)) problems.push("phone");
  if (!EMAIL_RE.test(email)) problems.push("email");
  if (input.acceptedTerms !== true) problems.push("terms");

  if (problems.length > 0) {
    return { ok: false, problems, message: problemsMessage(problems) };
  }

  return {
    ok: true,
    value: { slug, startsOn, endsOn, name, phone, email, jobNotes: jobNotes || null },
  };
}

/** "Nearly there — add your name, check your email address." */
export function problemsMessage(problems: BookingProblem[]): string {
  const phrases = problems.map((p) => PROBLEM_PHRASES[p]);
  return `Nearly there — ${phrases.join(", ")}.`;
}

// Reference codes.
//
// Thomas reads these down the phone, so the alphabet drops the characters
// that get misheard or mistyped: 0/O, 1/I/L, 5/S, 8/B. What's left is 24
// symbols; four of them is ~331k combinations, which is plenty for a
// one-ute hire business and short enough to say out loud.
//
// Collisions are still possible, so `reference` is UNIQUE in the database
// and the insert retries on a duplicate rather than trusting the odds.
const REF_ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ2346";
const REF_LENGTH = 4;

/**
 * A booking reference, e.g. "TRD-4KHW".
 *
 * Uses the crypto RNG rather than Math.random: references are quoted back to
 * confirm a booking, so they shouldn't be guessable from one another.
 */
export function makeReference(randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(REF_LENGTH))): string {
  let out = "";
  for (let i = 0; i < REF_LENGTH; i++) {
    out += REF_ALPHABET[randomBytes[i] % REF_ALPHABET.length];
  }
  return `TRD-${out}`;
}

/** When a pending request stops holding its dates. */
export function holdExpiresAt(from: Date, hours: number): string {
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}
