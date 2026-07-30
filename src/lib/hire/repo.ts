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

import { HOLDING_STATUSES, toCents, type AvailabilityContext, type Equipment, type Hold } from "./types";
import { today, type ISODate } from "./dates";
import { nextFreeDate } from "./availability";

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
