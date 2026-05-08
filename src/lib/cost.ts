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
//   * Any part of the first hour bills as a full hour at the configured
//     rate. So a worker who shows up for 5 minutes still costs 1h.
//   * After the first hour, time bills in 15-minute blocks rounded UP,
//     priced at rate_cents / 4 per block (so 4 blocks = exactly the
//     hourly rate; no rounding drift).
//   * A worker who never clocks in contributes nothing — assignment
//     alone doesn't trigger the first-hour minimum.
//   * `billed_hours` is the per-worker rounded-up hours summed across
//     the crew. It's the right Quantity for Xero so that
//       Quantity × UnitAmount === labour_cents/100
//     exactly.
export type CostBreakdown = {
  rate_cents: number;        // hourly rate per worker (per client type)
  worker_count: number;      // count assigned (open + closed entries)
  workers_billed: number;    // count that have actually started
  hours: number;             // ACTUAL on-site worker-hours (display)
  billed_hours: number;      // BILLABLE worker-hours after rounding
  first_hour_cents: number;  // sum of first-hour minimums per started worker
  overtime_blocks: number;   // 15-min blocks across workers (after first hour)
  overtime_cents: number;    // overtime_blocks × (rate_cents / 4)
  waiting_hours: number;
  labour_cents: number;      // = first_hour_cents + overtime_cents
  waiting_cents: number;
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

// Per-worker billing breakdown. Returns zero on a missing/zero entry —
// workers who never clocked in contribute nothing.
type EntryBilling = {
  on_site_hours: number;
  billed_hours: number;     // 0, 1.0, 1.25, 1.5, …
  first_hour_cents: number; // 0 or rate_cents
  overtime_blocks: number;  // count of 15-min blocks after the first hour
  overtime_cents: number;   // round(blocks × rate / 4)
};

function billingForEntry(
  entry: TimeEntry | undefined,
  rate_cents: number,
  now: Date,
): EntryBilling {
  const empty: EntryBilling = {
    on_site_hours: 0, billed_hours: 0,
    first_hour_cents: 0, overtime_blocks: 0, overtime_cents: 0,
  };
  if (!entry?.start) return empty;

  const start = new Date(entry.start).getTime();
  const end = entry.end ? new Date(entry.end).getTime() : now.getTime();
  const minutes = (end - start) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) return empty;

  const on_site_hours = minutes / 60;

  // Any part of the first hour → full first-hour minimum.
  const first_hour_cents = rate_cents;

  // After the first hour, every 15 minutes (rounded UP) at rate/4.
  const overtime_blocks = minutes <= 60 ? 0 : Math.ceil((minutes - 60) / 15);
  // Multiply first to keep precision, round once. With rate=5698,
  // 4 blocks × 5698 / 4 = 5698 exactly — no drift across a full hour.
  const overtime_cents = Math.round((overtime_blocks * rate_cents) / 4);

  return {
    on_site_hours,
    billed_hours: 1 + overtime_blocks * 0.25,
    first_hour_cents,
    overtime_blocks,
    overtime_cents,
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
  const waiting_hours = (job.waiting_time_minutes ?? 0) / 60;

  // Per-worker billing — only workers who've started count.
  let workers_billed = 0;
  let hours = 0;             // actual on-site total
  let billed_hours = 0;
  let first_hour_cents = 0;
  let overtime_blocks = 0;
  let overtime_cents = 0;

  for (const entry of Object.values(time_log)) {
    const b = billingForEntry(entry, rate_cents, now);
    if (b.first_hour_cents > 0) workers_billed += 1;
    hours            += b.on_site_hours;
    billed_hours     += b.billed_hours;
    first_hour_cents += b.first_hour_cents;
    overtime_blocks  += b.overtime_blocks;
    overtime_cents   += b.overtime_cents;
  }

  const labour_cents = first_hour_cents + overtime_cents;

  // Waiting time policy: per-worker (the crew waits together), unchanged
  // by the new labour-billing rule.
  const waiting_cents = Math.round(waiting_hours * rate_cents * worker_count);

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
    hours, billed_hours,
    first_hour_cents, overtime_blocks, overtime_cents,
    waiting_hours,
    labour_cents, waiting_cents,
    material_lines, materials_cents,
    total_cents,
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
