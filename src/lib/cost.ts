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

export type TimeLog = { start?: string; end?: string };

// Hours derived from time_log. If clocked in but not out, count up to
// "now" so the in-progress total is meaningful at a glance.
export function hoursFromTimeLog(time_log: TimeLog | undefined, now = new Date()): number {
  if (!time_log?.start) return 0;
  const start = new Date(time_log.start);
  const end = time_log.end ? new Date(time_log.end) : now;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / 3_600_000;
}

export function calculateCost(
  job: Pick<Job, "client_type" | "assigned_worker_ids" | "waiting_time_minutes" | "time_log">,
  materials: JobMaterialLine[],
  rates: Rates,
  now = new Date(),
): CostBreakdown {
  const rate_cents = rateFor(rates, job.client_type as ClientType);
  const worker_count = Math.max(1, job.assigned_worker_ids.length);

  const hours = hoursFromTimeLog(job.time_log as TimeLog, now);
  const waiting_hours = (job.waiting_time_minutes ?? 0) / 60;

  // Both labour and waiting bill per-worker per the spec.
  const labour_cents  = Math.round(hours         * rate_cents * worker_count);
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
