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

/** True when a hire is out and should have come back by now. */
export function isOverdue(status: ReservationStatus, endsOn: string, today: string): boolean {
  return status === "out" && endsOn < today;
}
