// The booking lifecycle, as a state machine.
//
//   pending ──confirm──> confirmed ──mark picked up──> out ──check in──> returned
//      └────decline────> declined
//
// Pure, so the admin UI and the API route agree on what's allowed without
// either re-deriving it. The UI uses it to decide which buttons to show;
// the route uses it to decide whether to honour a request — and the route's
// answer is the one that counts, because the buttons are only a suggestion.
//
// `cancelled` exists but isn't reachable from here: it's what the expiry
// sweep sets on a lapsed pending request. Thomas declines; the clock
// cancels. Keeping them distinct means the bookings list can tell "Thomas
// said no" apart from "they never heard back in time", which are different
// conversations to have with a customer.

import type { ReservationStatus } from "./types";

export type BookingAction = "confirm" | "mark-picked-up" | "check-in" | "decline";

type Transition = {
  action: BookingAction;
  from: ReservationStatus;
  to: ReservationStatus;
  /** Button label. Says what happens, and matches the confirmation that follows. */
  label: string;
  /** Shown in a confirm dialog. Absent means the action goes through unprompted. */
  confirm?: string;
  /** True for actions that need a second thought before firing. */
  destructive?: boolean;
};

const TRANSITIONS: readonly Transition[] = [
  {
    action: "confirm",
    from: "pending",
    to: "confirmed",
    label: "Confirm it",
  },
  {
    action: "decline",
    from: "pending",
    to: "declined",
    label: "Decline",
    destructive: true,
    // The spec asks for this prompt specifically: declining releases the
    // dates silently as far as the customer is concerned, so Thomas needs
    // reminding that someone is still waiting to hear from him.
    confirm:
      "Decline this request? The dates will be released. " +
      "They won't know why unless you call or text them.",
  },
  {
    action: "mark-picked-up",
    from: "confirmed",
    to: "out",
    label: "Mark picked up",
  },
  {
    action: "check-in",
    from: "out",
    to: "returned",
    label: "Check it in",
  },
];

/** Every action available from a given status, in the order to show them. */
export function actionsFor(status: ReservationStatus): Transition[] {
  return TRANSITIONS.filter((t) => t.from === status);
}

/** The transition an action makes from a status, or null if it isn't allowed. */
export function transitionFor(
  status: ReservationStatus,
  action: string,
): Transition | null {
  return TRANSITIONS.find((t) => t.from === status && t.action === action) ?? null;
}

/** Whether an action is legal right now. The API route's gate. */
export function canTransition(status: ReservationStatus, action: string): boolean {
  return transitionFor(status, action) !== null;
}

/**
 * Why an action was refused, phrased for a person.
 *
 * Called when `transitionFor` returns null, so the admin sees "this is
 * already out" rather than a bare 409 — usually it means they have a stale
 * tab open and someone (or the expiry sweep) moved the booking on.
 */
export function refusalReason(status: ReservationStatus, action: string): string {
  const known = TRANSITIONS.some((t) => t.action === action);
  if (!known) return "That isn't something you can do to a booking.";

  switch (status) {
    case "returned":
      return "That hire is finished — it's already been checked in.";
    case "declined":
      return "You've already declined that request.";
    case "cancelled":
      return "That request expired and released its dates. Nothing to do.";
    case "blocked":
      return "That's one of your own blocked periods, not a customer booking.";
    default:
      return `That booking is ${STATUS_LABELS[status].toLowerCase()}, so that step doesn't apply. Refresh and take another look.`;
  }
}

/** How each status reads in the interface. */
export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Needs answering",
  confirmed: "Confirmed",
  out: "Out on hire",
  returned: "Returned",
  declined: "Declined",
  cancelled: "Expired",
  blocked: "Blocked out",
};

/** Colour role per status, for pills. Kept out of the components so both lists agree. */
export const STATUS_TONE: Record<ReservationStatus, "warn" | "good" | "live" | "done" | "muted"> = {
  pending: "warn",
  confirmed: "good",
  out: "live",
  returned: "done",
  declined: "muted",
  cancelled: "muted",
  blocked: "muted",
};

/** Statuses a booking can be in while still being someone's live hire. */
export const OPEN_STATUSES: readonly ReservationStatus[] = ["pending", "confirmed", "out"];

// ─────────────────────────────────────────────────────────────────────
// The bond waiver
//
// Deliberately NOT a transition. Waiving doesn't move a booking through
// the lifecycle — a pending request with no bond is still pending — so it
// gets its own gate rather than being bolted onto the state machine and
// forcing every status into a second dimension.
//
// Thomas can do it for a regular he trusts, a trade mate, or any reason he
// likes. The rule is only about WHEN, not why.
// ─────────────────────────────────────────────────────────────────────

export type BondAction = "waive-bond" | "reinstate-bond";

/**
 * Statuses where the bond is still Thomas's to decide.
 *
 * Up to and including `out`, because he may only realise who it is when
 * they turn up at the counter. Once it's `returned` the money has been
 * handed back or was never taken, and changing the record afterwards would
 * describe a transaction that didn't happen. Declined and expired
 * bookings have no counter visit to charge at.
 */
export const BOND_DECIDABLE_STATUSES: readonly ReservationStatus[] = [
  "pending",
  "confirmed",
  "out",
];

export function canDecideBond(status: ReservationStatus): boolean {
  return BOND_DECIDABLE_STATUSES.includes(status);
}

/**
 * The bond button for a booking, or null when it isn't Thomas's call now.
 *
 * Waiving before confirming is the tidy path: the confirmation text quotes
 * the total, so a waiver applied afterwards means the customer has already
 * been told the higher figure. The label says so on pending bookings
 * rather than leaving him to work it out at the counter.
 */
export function bondActionFor(
  status: ReservationStatus,
  bondWaived: boolean,
): { action: BondAction; label: string; confirm?: string } | null {
  if (!canDecideBond(status)) return null;

  if (bondWaived) {
    return {
      action: "reinstate-bond",
      label: "Charge the bond",
      confirm:
        "Put the bond back on this hire? If you've already confirmed it, " +
        "they've been texted the lower figure — give them a heads up.",
    };
  }

  return {
    action: "waive-bond",
    label: "No bond",
    confirm:
      status === "pending"
        ? "Skip the bond for this customer? Do it before you confirm and the " +
          "text they get will show the lower total."
        : "Skip the bond for this customer? They've already been texted the " +
          "total with it, so tell them when they collect.",
  };
}

/** Why a bond change was refused, phrased for a person. */
export function bondRefusalReason(status: ReservationStatus): string {
  switch (status) {
    case "returned":
      return "That hire is finished — the bond has already been settled either way.";
    case "declined":
      return "You declined that request, so there's no bond to take.";
    case "cancelled":
      return "That request expired, so there's no bond to take.";
    case "blocked":
      return "That's one of your own blocked periods, not a customer booking.";
    default:
      return "The bond can't be changed on that booking.";
  }
}

/** True when a hire is out and should have come back by now. */
export function isOverdue(status: ReservationStatus, endsOn: string, today: string): boolean {
  return status === "out" && endsOn < today;
}
