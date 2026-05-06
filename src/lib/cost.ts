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

export type CostBreakdown = {
  rate_cents: number;        // hourly rate per worker
  worker_count: number;
  hours: number;             // worked hours from time_log (decimal)
  waiting_hours: number;     // waiting_time_minutes / 60 (decimal)
  labour_cents: number;
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

export function calculateCost(
  job: Pick<Job, "client_type" | "assigned_worker_ids" | "waiting_time_minutes" | "time_log">,
  materials: JobMaterialLine[],
  rates: Rates,
  now = new Date(),
): CostBreakdown {
  const rate_cents = rateFor(rates, job.client_type as ClientType);
  const worker_count = Math.max(1, job.assigned_worker_ids.length);

  // `hours` here is the total worker-hours summed across the crew.
  // Multiplying by rate gives the labour cost directly — no separate
  // worker_count multiplier required (that's already baked in).
  const hours = totalHoursFromTimeLog(job.time_log as TimeLog, now);
  const waiting_hours = (job.waiting_time_minutes ?? 0) / 60;

  // Labour: sum of per-worker hours, billed once at the rate.
  // Waiting time is recorded as a single number on the job, so it
  // still bills per-worker (the whole crew waits together).
  const labour_cents  = Math.round(hours         * rate_cents);
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
    rate_cents, worker_count,
    hours, waiting_hours,
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
