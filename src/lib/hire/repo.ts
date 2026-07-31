// The only part of the hire engine that touches the database.
//
// Everything in ./availability and ./charging is pure. This module reads
// rows, converts them into an `AvailabilityContext`, and hands off. Keep it
// that way: business rules do not belong in here, and queries do not belong
// in there.
//
// All reads go through the service-role client, consistent with the rest of
// the app (see CLAUDE.md — NextAuth holds sessions, the anon key is locked
// out at the database). The `hire_availability` RPC exists for any future
// anon-key caller and returns dates and nothing else; server code doesn't
// need it because the service role can read the table directly — but note
// that means **every selector here must list its columns explicitly**.
// `select("*")` on `reservations` would pull customer names, phones and
// emails into places they must never reach.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HOLDING_STATUSES,
  toCents,
  type AvailabilityContext,
  type Equipment,
  type Hold,
  type ReservationKind,
  type ReservationStatus,
} from "./types";
import { addMonths, today, type ISODate } from "./dates";
import { nextFreeDate } from "./availability";
import { OPEN_STATUSES } from "./workflow";

/** Columns safe to read for the catalogue. No PII lives on `equipment`. */
const EQUIPMENT_COLUMNS =
  "id, slug, name, category, blurb, specs, daily_rate, bond, photo_path, flyer_path, is_published, sort_order, changeover_days";

/**
 * Columns of `reservations` needed to draw a calendar.
 *
 * Dates, kind and expiry only — deliberately no customer_name /
 * customer_phone / customer_email / job_notes. Doug's tools run through
 * this path, so anything selected here can end up in a conversation with
 * a different customer.
 */
const HOLD_COLUMNS = "starts_on, ends_on, kind, status, expires_at";

type EquipmentRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  blurb: string | null;
  specs: string[] | null;
  daily_rate: string | number;
  bond: string | number;
  photo_path: string | null;
  flyer_path: string | null;
  is_published: boolean;
  sort_order: number;
  changeover_days: number;
};

export function mapEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    blurb: row.blurb,
    specs: row.specs ?? [],
    dailyRateCents: toCents(row.daily_rate),
    bondCents: toCents(row.bond),
    photoPath: row.photo_path,
    flyerPath: row.flyer_path,
    isPublished: row.is_published,
    sortOrder: row.sort_order,
    changeoverDays: row.changeover_days ?? 0,
  };
}

/**
 * Published, not-soft-deleted equipment, in Thomas's chosen order.
 * This is the public catalogue and the list Doug is allowed to talk about.
 */
export async function listPublishedEquipment(supabase: SupabaseClient): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select(EQUIPMENT_COLUMNS)
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => mapEquipment(r as EquipmentRow));
}

/** Everything on the books, published or not — admin only. */
export async function listAllEquipment(supabase: SupabaseClient): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select(EQUIPMENT_COLUMNS)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => mapEquipment(r as EquipmentRow));
}

/**
 * One item by slug.
 *
 * `includeUnpublished` defaults to false so a public caller can't reach an
 * unpublished tool by guessing its slug — rule 4. Admin paths pass true.
 */
export async function getEquipmentBySlug(
  supabase: SupabaseClient,
  slug: string,
  opts: { includeUnpublished?: boolean } = {},
): Promise<Equipment | null> {
  let q = supabase.from("equipment").select(EQUIPMENT_COLUMNS).eq("slug", slug).is("deleted_at", null);
  if (!opts.includeUnpublished) q = q.eq("is_published", true);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data ? mapEquipment(data as EquipmentRow) : null;
}

/**
 * Date spans holding this equipment.
 *
 * Optionally windowed — pass `from`/`to` when drawing a month so a tool with
 * years of history doesn't drag its whole diary across the wire.
 *
 * EXPIRED PENDINGS: a pending request holds its dates for 24 hours (rule 5).
 * Once past `expires_at` it no longer should, but the row still says
 * 'pending' until `expire_pending_reservations()` sweeps it. We drop those
 * here so the calendar honours the promise immediately rather than waiting
 * on the cron. The write path must therefore call `releaseExpiredHolds()`
 * before inserting — otherwise the exclusion constraint, which still counts
 * the stale row, would reject a booking the page had just offered.
 */
export async function listHolds(
  supabase: SupabaseClient,
  equipmentId: string,
  window?: { from: ISODate; to: ISODate },
): Promise<Hold[]> {
  let q = supabase
    .from("reservations")
    .select(HOLD_COLUMNS)
    .eq("equipment_id", equipmentId)
    .in("status", HOLDING_STATUSES as unknown as string[]);

  if (window) {
    // Overlap test: a span touches the window unless it ends before it
    // starts or starts after it ends.
    q = q.lte("starts_on", window.to).gte("ends_on", window.from);
  }

  const { data, error } = await q;
  if (error) throw error;

  const now = Date.now();
  return (data ?? [])
    .filter((r: { status: string; expires_at: string | null }) => {
      if (r.status !== "pending") return true;
      return !r.expires_at || new Date(r.expires_at).getTime() > now;
    })
    .map((r: { starts_on: string; ends_on: string; kind: Hold["kind"] }) => ({
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      kind: r.kind,
    }));
}

/**
 * Build the context the pure functions consume.
 *
 * `today` comes from the Adelaide-anchored helper, never `new Date()`.
 */
export async function availabilityContextFor(
  supabase: SupabaseClient,
  equipment: Equipment,
  window?: { from: ISODate; to: ISODate },
): Promise<AvailabilityContext> {
  return {
    today: today(),
    holds: await listHolds(supabase, equipment.id, window),
    changeoverDays: equipment.changeoverDays,
  };
}

/**
 * The catalogue with each item's next collectable day — the "Next free
 * Tue 12 Aug" line on every card.
 */
export async function listPublishedEquipmentWithAvailability(
  supabase: SupabaseClient,
): Promise<Array<{ equipment: Equipment; nextFree: ISODate | null }>> {
  const items = await listPublishedEquipment(supabase);
  return Promise.all(
    items.map(async (equipment) => ({
      equipment,
      nextFree: nextFreeDate(await availabilityContextFor(supabase, equipment)),
    })),
  );
}

/** One catalogue item, with everything the page needs to draw it. */
export type HireCatalogueEntry = {
  equipment: Equipment;
  /** Holds inside the loaded window. Dates only — no customer details. */
  holds: Hold[];
  nextFree: ISODate | null;
};

/**
 * The whole public catalogue in two queries, whatever the item count.
 *
 * `listPublishedEquipmentWithAvailability` above runs one holds query per
 * item, which is fine for a handful of tools but is an N+1. This fetches
 * every hold for every published item at once and groups in memory — the
 * page renders on each request, so it's worth the difference.
 *
 * `monthsAhead` bounds the window. The calendar lets a customer page
 * forward that far and no further, so loading beyond it would be wasted;
 * loading less would draw empty months that are actually booked.
 */
export async function loadHireCatalogue(
  supabase: SupabaseClient,
  monthsAhead = 12,
): Promise<{ today: ISODate; horizon: ISODate; entries: HireCatalogueEntry[] }> {
  const from = today();
  const horizon = addMonths(from, monthsAhead);

  const equipment = await listPublishedEquipment(supabase);
  if (equipment.length === 0) return { today: from, horizon, entries: [] };

  const { data, error } = await supabase
    .from("reservations")
    // equipment_id is needed to group; it identifies a tool, not a person.
    .select(`equipment_id, ${HOLD_COLUMNS}`)
    .in(
      "equipment_id",
      equipment.map((e) => e.id),
    )
    .in("status", HOLDING_STATUSES as unknown as string[])
    .lte("starts_on", horizon)
    .gte("ends_on", from);

  if (error) throw error;

  const now = Date.now();
  const byEquipment = new Map<string, Hold[]>();
  for (const r of (data ?? []) as Array<{
    equipment_id: string;
    starts_on: string;
    ends_on: string;
    kind: Hold["kind"];
    status: string;
    expires_at: string | null;
  }>) {
    // Same expiry rule as listHolds — a pending request past its 24 hours
    // stops holding dates immediately rather than waiting for the sweep.
    if (r.status === "pending" && r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
    const list = byEquipment.get(r.equipment_id) ?? [];
    list.push({ startsOn: r.starts_on, endsOn: r.ends_on, kind: r.kind });
    byEquipment.set(r.equipment_id, list);
  }

  return {
    today: from,
    horizon,
    entries: equipment.map((eq) => {
      const holds = byEquipment.get(eq.id) ?? [];
      return {
        equipment: eq,
        holds,
        nextFree: nextFreeDate({ today: from, holds, changeoverDays: eq.changeoverDays }),
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────
// ADMIN READS
//
// Everything below returns customer details, and so must only ever be
// reached from a route or page that has already run requireAdmin /
// requireApiAdmin. Doug's tools and the public page use the PII-free
// helpers above — do not swap one for the other to save a query.
// ─────────────────────────────────────────────────────────────────────

/** Columns for the admin bookings views. Includes PII, unlike HOLD_COLUMNS. */
const ADMIN_RESERVATION_COLUMNS =
  "id, equipment_id, kind, status, starts_on, ends_on, reference, customer_name, " +
  "customer_phone, customer_email, job_notes, charged_days, hire_total, bond_total, " +
  "block_reason, bond_waived, created_at, expires_at";

export type AdminReservation = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  kind: ReservationKind;
  status: ReservationStatus;
  startsOn: ISODate;
  endsOn: ISODate;
  reference: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  jobNotes: string | null;
  chargedDays: number | null;
  hireTotalCents: number;
  bondTotalCents: number;
  /** True when Thomas has decided not to collect the bond on this hire. */
  bondWaived: boolean;
  blockReason: string | null;
  createdAt: string;
  expiresAt: string | null;
};

type AdminReservationRow = {
  id: string;
  equipment_id: string;
  kind: ReservationKind;
  status: ReservationStatus;
  starts_on: string;
  ends_on: string;
  reference: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  job_notes: string | null;
  charged_days: number | null;
  hire_total: string | number | null;
  bond_total: string | number | null;
  bond_waived: boolean | null;
  block_reason: string | null;
  created_at: string;
  expires_at: string | null;
  equipment?: { name: string } | { name: string }[] | null;
};

function mapAdminReservation(row: AdminReservationRow): AdminReservation {
  // PostgREST returns an embedded one-to-one as an object, but types it as
  // possibly-an-array depending on how it infers the relationship.
  const eq = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    equipmentName: eq?.name ?? "Unknown item",
    kind: row.kind,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reference: row.reference,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    jobNotes: row.job_notes,
    chargedDays: row.charged_days,
    hireTotalCents: toCents(row.hire_total),
    bondTotalCents: toCents(row.bond_total),
    bondWaived: row.bond_waived === true,
    blockReason: row.block_reason,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Bookings for the admin table.
 *
 * `kind` defaults to 'hire' — Thomas's own blocks are managed on the
 * availability screen, not mixed into the customer list.
 */
export async function listAdminReservations(
  supabase: SupabaseClient,
  opts: {
    statuses?: ReservationStatus[];
    kind?: ReservationKind;
    limit?: number;
  } = {},
): Promise<AdminReservation[]> {
  let q = supabase
    .from("reservations")
    .select(`${ADMIN_RESERVATION_COLUMNS}, equipment!inner(name)`)
    .eq("kind", opts.kind ?? "hire")
    .order("starts_on", { ascending: true })
    .limit(opts.limit ?? 400);

  if (opts.statuses?.length) q = q.in("status", opts.statuses);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapAdminReservation(r as unknown as AdminReservationRow));
}

/** One booking by id, with customer detail. */
export async function getAdminReservation(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminReservation | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select(`${ADMIN_RESERVATION_COLUMNS}, equipment!inner(name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAdminReservation(data as unknown as AdminReservationRow) : null;
}

export type AdminToday = {
  today: ISODate;
  /** Requests waiting on an answer, oldest first — these are the ones costing goodwill. */
  needsAnswer: AdminReservation[];
  /** Confirmed hires due for collection today. */
  goingOut: AdminReservation[];
  /** Hires due back today or earlier. Anything earlier is overdue. */
  comingBack: AdminReservation[];
  tiles: {
    requestsToAnswer: number;
    outOnHire: number;
    dueBack: number;
    onTheFloor: number;
  };
};

/**
 * Everything the Today screen shows, in two queries.
 *
 * Thomas opens this on his phone between jobs, so it answers "what needs me
 * right now" rather than "here is the diary".
 */
export async function loadAdminToday(supabase: SupabaseClient): Promise<AdminToday> {
  const from = today();

  const [open, equipment] = await Promise.all([
    listAdminReservations(supabase, { statuses: ["pending", "confirmed", "out"] }),
    listPublishedEquipment(supabase),
  ]);

  const needsAnswer = open
    .filter((r) => r.status === "pending")
    // Oldest request first — it's the one closest to expiring.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const outOnHire = open.filter((r) => r.status === "out");

  return {
    today: from,
    needsAnswer,
    goingOut: open.filter((r) => r.status === "confirmed" && r.startsOn <= from),
    // Due back today, plus anything already past its return date.
    comingBack: outOnHire.filter((r) => r.endsOn <= from),
    tiles: {
      requestsToAnswer: needsAnswer.length,
      outOnHire: outOnHire.length,
      dueBack: outOnHire.filter((r) => r.endsOn <= from).length,
      // "On the floor" = published, not currently out. What a walk-in could take.
      onTheFloor:
        equipment.length - new Set(outOnHire.map((r) => r.equipmentId)).size,
    },
  };
}

/**
 * Open reservations for a piece of equipment — the removal rule's gate.
 *
 * Returns the reservations that make an item undeletable: anything pending,
 * confirmed or out. Returned/declined/cancelled history doesn't block
 * removal, which is why this filters rather than counting every row.
 */
export async function openReservationsForEquipment(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<Array<{ id: string; status: ReservationStatus; startsOn: ISODate; endsOn: ISODate }>> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id, status, starts_on, ends_on")
    .eq("equipment_id", equipmentId)
    .in("status", OPEN_STATUSES as unknown as string[]);
  if (error) throw error;
  return (data ?? []).map((r: { id: string; status: ReservationStatus; starts_on: string; ends_on: string }) => ({
    id: r.id,
    status: r.status,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
  }));
}

/** Thomas's own blocked periods for an item, upcoming first. */
export async function listBlocks(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<AdminReservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(`${ADMIN_RESERVATION_COLUMNS}, equipment!inner(name)`)
    .eq("equipment_id", equipmentId)
    .eq("kind", "block")
    .eq("status", "blocked")
    .gte("ends_on", today())
    .order("starts_on", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapAdminReservation(r as unknown as AdminReservationRow));
}

/**
 * Flip expired pending requests to cancelled, releasing their dates.
 *
 * Call before any reservation insert, and from the scheduled job. Returns
 * the number released. Safe to call concurrently — the update is a single
 * statement in the database.
 */
export async function releaseExpiredHolds(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("expire_pending_reservations");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
