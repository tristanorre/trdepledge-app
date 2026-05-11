import type { ClientType, Job } from "@/lib/types";
import { rateFor, type Rates } from "@/lib/config";

// All money is integers (cents). Never floats. Display formatting at the
// edge only.

export type JobMaterialLine = {
  id: string;
  job_id: string;
  material_id: string;
  qty: number;
  markup_percent: number;
  // Joined from materials_catalogue for display + costing.
  name: string;
  unit: string;
  base_price_cents: number;
};

// Billing rule (per-client-type rate, per-worker rounding):
//   * Time bills in 5-minute blocks rounded UP, from minute 1.
//     No minimum charge — a worker on site for 3 minutes bills 1
//     block (5 min) at rate / 12; a worker on site for 67 minutes
//     bills 14 blocks (70 min) at rate / 12 per block.
//   * Per-block price = rate_cents / 12. 12 blocks of 5 minutes
//     = 60 minutes = the full hourly rate, with no rounding drift
//     across a full hour (we multiply first, round once).
//   * `waiting_time_minutes` (set on the job, shared by the crew) is
//     added to every clocked-in worker's billable minutes BEFORE the
//     5-min rounding. Recorded separately for transparency
//     (see `waiting_hours`) but billed inside `labour_cents`.
//   * A worker who never clocks in contributes nothing — assignment
//     alone doesn't trigger billing.
//   * `billed_hours` is the per-worker rounded-up hours summed
//     across the crew. Right Quantity for Xero so
//       Quantity × UnitAmount === labour_cents / 100
//     exactly.
export type CostBreakdown = {
  rate_cents: number;        // hourly rate per worker (per client type)
  worker_count: number;      // count assigned (open + closed entries)
  workers_billed: number;    // count that have actually started
  hours: number;             // ACTUAL on-site worker-hours (display)
  billed_hours: number;      // BILLABLE worker-hours after 5-min rounding
  billed_blocks: number;     // total 5-min blocks across the crew
  waiting_hours: number;
  labour_cents: number;
  waiting_cents: number;     // always 0 — waiting is folded into labour
  material_lines: Array<{
    id: string;
    name: string;
    qty: number;
    unit: string;
    base_cents: number;
    markup_percent: number;
    line_total_cents: number;
  }>;
  materials_cents: number;
  total_cents: number;
};

export type TimeEntry = { start?: string; end?: string };
export type TimeLog = Record<string, TimeEntry>;

// Hours for a single worker (or the open clock if `end` is missing).
// If clocked in but not out, count up to "now" so the in-progress total
// is meaningful at a glance.
export function hoursForEntry(entry: TimeEntry | undefined, now = new Date()): number {
  if (!entry?.start) return 0;
  const start = new Date(entry.start);
  const end = entry.end ? new Date(entry.end) : now;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / 3_600_000;
}

// Sum of hours across all workers in a `time_log`.
export function totalHoursFromTimeLog(time_log: TimeLog | undefined, now = new Date()): number {
  if (!time_log) return 0;
  let total = 0;
  for (const entry of Object.values(time_log)) total += hoursForEntry(entry, now);
  return total;
}

type EntryBilling = {
  on_site_hours: number;
  billed_blocks: number;     // 5-min blocks rounded up
  billed_hours: number;      // = blocks / 12
  labour_cents: number;
};

function billingForEntry(
  entry: TimeEntry | undefined,
  rate_cents: number,
  waiting_minutes: number,
  now: Date,
): EntryBilling {
  const empty: EntryBilling = {
    on_site_hours: 0, billed_blocks: 0, billed_hours: 0, labour_cents: 0,
  };
  if (!entry?.start) return empty;

  const start = new Date(entry.start).getTime();
  const end = entry.end ? new Date(entry.end).getTime() : now.getTime();
  const onSiteMinutes = (end - start) / 60_000;
  if (!Number.isFinite(onSiteMinutes) || onSiteMinutes <= 0) return empty;

  // Waiting time is shared by the crew and added to every clocked-in
  // worker's billable minutes. Workers who never clocked in bail out
  // above and never see waiting time.
  const billableMinutes = onSiteMinutes + Math.max(0, waiting_minutes);

  // 5-min block rounding. ceil(3/5) = 1, ceil(67/5) = 14.
  const billed_blocks = Math.ceil(billableMinutes / 5);

  // Multiply-first-round-once: with rate=5500 (Private), 12 blocks
  // gives round(12 × 5500 / 12) = 5500 — exact. No drift across a
  // full hour.
  const labour_cents = Math.round((billed_blocks * rate_cents) / 12);

  return {
    on_site_hours: onSiteMinutes / 60,
    billed_blocks,
    billed_hours: billed_blocks / 12,
    labour_cents,
  };
}

export function calculateCost(
  job: Pick<Job, "client_type" | "assigned_worker_ids" | "waiting_time_minutes" | "time_log">,
  materials: JobMaterialLine[],
  rates: Rates,
  now = new Date(),
): CostBreakdown {
  const rate_cents = rateFor(rates, job.client_type as ClientType);
  const worker_count = Math.max(1, job.assigned_worker_ids.length);

  const time_log = (job.time_log ?? {}) as TimeLog;
  const waiting_minutes = Math.max(0, job.waiting_time_minutes ?? 0);
  const waiting_hours = waiting_minutes / 60;

  let workers_billed = 0;
  let hours = 0;             // actual on-site total
  let billed_hours = 0;
  let billed_blocks = 0;
  let labour_cents = 0;

  for (const entry of Object.values(time_log)) {
    const b = billingForEntry(entry, rate_cents, waiting_minutes, now);
    if (b.billed_blocks > 0) workers_billed += 1;
    hours         += b.on_site_hours;
    billed_hours  += b.billed_hours;
    billed_blocks += b.billed_blocks;
    labour_cents  += b.labour_cents;
  }

  // Waiting is folded into labour above; this field stays 0 so any
  // legacy rollup doesn't double-count.
  const waiting_cents = 0;

  const material_lines = materials.map((m) => {
    const base = m.base_price_cents * m.qty;
    const line_total = Math.round(base * (1 + m.markup_percent / 100));
    return {
      id: m.id,
      name: m.name,
      qty: m.qty,
      unit: m.unit,
      base_cents: m.base_price_cents,
      markup_percent: m.markup_percent,
      line_total_cents: line_total,
    };
  });
  const materials_cents = material_lines.reduce((s, l) => s + l.line_total_cents, 0);

  const total_cents = labour_cents + waiting_cents + materials_cents;

  return {
    rate_cents, worker_count, workers_billed,
    hours, billed_hours, billed_blocks,
    waiting_hours,
    labour_cents, waiting_cents,
    material_lines, materials_cents,
    total_cents,
  };
}

// ─────────────────────────────────────────────────────────────────
// Quote estimating — separate from actual-cost calculation.
//
// When Thomas is preparing a quote the job has no time_log yet, so
// he gives the system an estimated hours-per-worker and worker
// count. We multiply by the configured rate (no 5-min rounding —
// estimates are estimates, not billable measurements) and add
// the planned materials list.
//
// Returns the same CostBreakdown shape so the existing display +
// Xero adapter can reuse it. `billed_hours` is the right Quantity
// for the Xero Quote line item.
// ─────────────────────────────────────────────────────────────────
export function calculateQuoteEstimate(
  job: Pick<Job, "client_type">,
  estimateHoursPerWorker: number,
  estimateWorkerCount: number,
  materials: JobMaterialLine[],
  rates: Rates,
): CostBreakdown {
  const rate_cents = rateFor(rates, job.client_type as ClientType);
  const safeHours = Math.max(0, estimateHoursPerWorker);
  const safeWorkers = Math.max(1, Math.floor(estimateWorkerCount));

  const total_worker_hours = safeHours * safeWorkers;
  // 12 blocks per hour = 5-min granularity — matches actual-cost
  // rounding so a quote of 2.0 hours × 2 workers prices identically
  // to an actual job of 2.0 hours × 2 workers.
  const billed_blocks = Math.round(total_worker_hours * 12);
  const labour_cents = Math.round((billed_blocks * rate_cents) / 12);

  const material_lines = materials.map((m) => {
    const base = m.base_price_cents * m.qty;
    const line_total = Math.round(base * (1 + m.markup_percent / 100));
    return {
      id: m.id,
      name: m.name,
      qty: m.qty,
      unit: m.unit,
      base_cents: m.base_price_cents,
      markup_percent: m.markup_percent,
      line_total_cents: line_total,
    };
  });
  const materials_cents = material_lines.reduce((s, l) => s + l.line_total_cents, 0);

  return {
    rate_cents,
    worker_count: safeWorkers,
    workers_billed: safeWorkers,
    hours: total_worker_hours,
    billed_hours: total_worker_hours,
    billed_blocks,
    waiting_hours: 0,
    labour_cents,
    waiting_cents: 0,
    material_lines,
    materials_cents,
    total_cents: labour_cents + materials_cents,
  };
}

export function fmtMoney(cents: number): string {
  // Always two decimals. Use AUD locale; symbol added explicitly so the
  // output is consistent across SSR / CSR locale variations.
  const dollars = (cents / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${dollars}`;
}
