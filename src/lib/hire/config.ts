// DIY Hire — single source of truth for the figures and policy copy that
// aren't in the database.
//
// ─────────────────────────────────────────────────────────────────────
// READ THIS BEFORE CHANGING A NUMBER
//
// Anything marked `// UNCONFIRMED` was invented for the prototypes and has
// NOT been confirmed by Thomas. It is deliberately collected here so the
// whole set can be corrected in one edit rather than hunted through the
// codebase. See the pre-launch checklist in the PR description.
//
// Doug must never state an unconfirmed figure as fact — every number he
// quotes comes from a tool call against the database or this file, and the
// unconfirmed ones are flagged so the UI can caveat them.
// ─────────────────────────────────────────────────────────────────────

/**
 * Whether /hire is ready for the public to find.
 *
 * `false` puts `noindex, nofollow` on the page so search engines don't list
 * it while it's still being finished. The page stays reachable by URL — this
 * is not access control, just a request to crawlers not to advertise it.
 *
 * The original two blockers are now down to one:
 *   1. ~~Bond figures were placeholders~~ — settled at $100 (migration 0035).
 *   2. Thomas gets a text when a request arrives, but only if
 *      HIRE_NOTIFY_MOBILE is set in production. Unset, it falls back to the
 *      flyer number, which is probably right — "probably" being the reason
 *      this is still a checklist item.
 *
 * Every rate and bond on the page is now confirmed, so that half of the
 * checklist is done: the figures the page states as fact are facts.
 *
 * FLIP THIS TO `true` AT LAUNCH. It also turns the home page hero tile from
 * a COMING SOON teaser into a live link, so one switch opens both doors.
 */
export const HIRE_PUBLIC_LAUNCH = false;

/** Thomas's mobile. Confirmed — printed on the flyers. */
export const HIRE_PHONE = "0474 844 204";
export const HIRE_PHONE_TEL = "0474844204";

/** Pickup location. Confirmed. */
export const HIRE_LOCATION = "Wallaroo SA";

// Counter hours. Confirmed — Mon–Fri 7am–5pm, shut both weekend days.
//
// This drives rule 2 of the availability engine: no collection and no
// return happens on a day the counter is shut. A hire may *span* a
// weekend (the customer keeps the tool) but cannot start or end on one.
export const COUNTER_HOURS = {
  weekdays: "Mon–Fri 7am–5pm",
  saturday: "Closed",
  sunday: "Closed",
} as const;

/** Day indices the counter is shut, 0 = Monday … 6 = Sunday. */
export const CLOSED_DAY_INDICES: readonly number[] = [5, 6]; // Sat, Sun

/**
 * How long a pending request holds its dates before it is released.
 *
 * The public page promises "your dates are held while Thomas confirms",
 * so pending reservations occupy the calendar. Without an expiry, one
 * abandoned form would lock a tool forever — see
 * `expire_pending_reservations()` in the database and the cron that calls it.
 */
export const PENDING_HOLD_HOURS = 24;

/**
 * How far ahead "next free date" will look before giving up.
 * A tool booked solid for four months reads as "Ask us about dates".
 */
export const AVAILABILITY_HORIZON_DAYS = 120;

/** Reasons Thomas can give when blocking dates out. Matches the admin prototype. */
export const BLOCK_REASONS = [
  "On my own job",
  "Servicing or repair",
  "Lent out",
  "Not available",
] as const;

export type BlockReason = (typeof BLOCK_REASONS)[number];

// ─────────────────────────────────────────────────────────────────────
// UNCONFIRMED figures
// ─────────────────────────────────────────────────────────────────────

/**
 * Bond per item. CONFIRMED — Thomas set one figure for the whole floor:
 * $100, migration 0035.
 *
 * The live values are still the `bond` column on `equipment`, so a future
 * per-item bond needs no code change. This flag stays because it's what
 * the UI and Doug read to decide whether to caveat the figure; now that
 * it's true, they state it plainly.
 *
 * Note this is the bond as ADVERTISED. Thomas can waive it on any
 * individual hire from the admin console — see `bond_waived` — and that
 * is deliberately not published anywhere a customer can read it.
 */
export const BONDS_CONFIRMED = true;

/**
 * Slugs whose daily rate Thomas hasn't signed off.
 *
 * EMPTY, and that's the point — every rate on the floor is now confirmed.
 * The lawn mower was the last holdout ($40 invented for the prototypes,
 * settled at $50 in migration 0036); the other five come from the flyers.
 *
 * Kept rather than deleted because it's the mechanism Doug and the UI read
 * to decide whether to caveat a figure. Add a slug here the moment a rate
 * becomes a guess again — a new item priced off the top of someone's head,
 * say — and the caveat comes back on its own.
 */
export const UNCONFIRMED_RATE_SLUGS: readonly string[] = [];

/**
 * Items whose photo has a transparent background, and so render contained
 * with a shadow rather than cropped to fill the card.
 *
 * The lawn mower is here because its shot is cut out, NOT because it's a
 * placeholder — it used to be a crop of a Thomas cartoon and is now a real
 * photo of the machine, debranded and keyed by
 * scripts/hire-flyers/debrand-lawn-mower.py. Cropping a cut-out to fill
 * would slice the handle off, which is the whole reason this list exists.
 */
export const CUTOUT_PHOTO_SLUGS: readonly string[] = ["lawn-mower"];

/**
 * Delivery fee and radius. // UNCONFIRMED — referenced in copy, never quantified.
 * Deliberately not modelled as a price: delivery stays phone-only until
 * Thomas gives a figure. Do not build a delivery flow off this.
 */
export const DELIVERY_FEE_CENTS: number | null = null;

/** Late return charge. // UNCONFIRMED — copy says "full daily rate", unverified. */
export const LATE_RETURN_CHARGE = "the full daily rate" as const;

// ─────────────────────────────────────────────────────────────────────
// Policy copy — the ONE place the hire terms live.
//
// The terms accordion on /hire, and Doug's `hire_policy` tool, both read
// from here. When Thomas changes a policy it changes on the page and in
// Doug's mouth at the same time. Never duplicate this text into a system
// prompt or a component.
//
// Copy is carried across verbatim from the approved prototype.
// ─────────────────────────────────────────────────────────────────────

export type PolicyTopic =
  | "bond"
  | "hours"
  | "pickup"
  | "delivery"
  | "fuel"
  | "damage"
  | "id"
  | "duration"
  | "cancellation";

export type PolicyEntry = {
  /** Accordion heading. */
  title: string;
  /** Body copy. Plain text — no markup, so Doug can speak it as-is. */
  body: string;
  /** True when the copy contains a figure Thomas hasn't signed off. */
  unconfirmed?: boolean;
};

export const HIRE_POLICY: Record<PolicyTopic, PolicyEntry> = {
  bond: {
    title: "Bond and payment",
    body:
      "The bond is taken at pickup and refunded once the tool is back, clean and undamaged. " +
      "Hire fees are payable at pickup by card or cash. Nothing is charged when you send a " +
      "booking request.",
  },
  duration: {
    title: "How the day is counted",
    body:
      "A day runs from pickup to the same time the next day, and the day you bring it back " +
      "isn't charged. We're closed Saturday and Sunday, so weekend days aren't charged either — " +
      "but a hire that keeps the tool over the weekend is charged for two days. Collect Friday, " +
      "bring it back Monday, and you pay for two. Late returns are charged at the full daily rate.",
    unconfirmed: true, // late return charge unverified
  },
  fuel: {
    title: "Fuel, oil and consumables",
    body:
      "Petrol gear goes out with a full tank and comes back full, or we deduct the top-up from " +
      "the bond. Two-stroke mix is available at the counter. Augers, chisels and blades are " +
      "supplied sharp — fair wear is expected, breakage is not.",
  },
  damage: {
    title: "Damage, loss and safe use",
    body:
      "You're responsible for the tool from pickup to return, including theft from your site. " +
      "Every hire includes a run-through before you leave and you can call Thomas mid-job if " +
      "something isn't behaving. Don't use the demolition hammer or plate compactor without " +
      "closed footwear, eye protection and hearing protection.",
  },
  cancellation: {
    title: "Cancelling or changing dates",
    body:
      "Change or cancel free up to 24 hours before pickup — just call or text. Inside 24 hours " +
      "we'll do what we can, but the gear may already be committed elsewhere.",
  },
  delivery: {
    title: "Delivery",
    body:
      "Pickup from Wallaroo is standard. Delivery around Kadina, Moonta and Moonta Bay can be " +
      "arranged for a fee — ask when you book.",
    unconfirmed: true, // fee and radius unquantified
  },
  // Topics Doug can be asked about that don't get their own accordion entry.
  hours: {
    title: "Counter hours",
    body:
      `The counter is open ${COUNTER_HOURS.weekdays}, closed Saturday and Sunday. ` +
      "You can keep a tool over the weekend — you just can't collect or return one, " +
      "which is why the weekend isn't charged.",
  },
  pickup: {
    title: "Pickup",
    body:
      `Pickup is from ${HIRE_LOCATION} during counter hours. Bring photo ID and a way to pay ` +
      "the hire fee and bond — card or cash, both taken at the counter, nothing online.",
  },
  id: {
    title: "ID and age",
    body:
      "You need to be 18 or over and bring photo ID to collect. The name on the ID should match " +
      "the booking.",
  },
};

/**
 * The weekend line on the hero counter-facts strip.
 *
 * Lives here rather than in the page so it can't drift out of step with
 * `chargedDays()` and `HIRE_POLICY.duration`. The spec is explicit that the
 * weekend rule is advertised in three places and the copy has to move
 * whenever the rule does.
 */
export const WEEKEND_NOTE =
  "Collect Friday, return Monday — charged as two days, not three." as const;

/** The six entries the /hire terms accordion renders, in prototype order. */
export const TERMS_ACCORDION_ORDER: readonly PolicyTopic[] = [
  "bond",
  "duration",
  "fuel",
  "damage",
  "cancellation",
  "delivery",
];
