// Hand-written DB types covering the Slice-1/3 surface area.
// Keep these aligned with the SQL migrations — when a column changes,
// update both. (We intentionally don't auto-generate types yet — the
// schema is small, the duplication is cheap, and the explicit types are
// a useful sanity check on every API route.)

export type Role = "admin" | "worker";

export type ClientType = "Private" | "NDIS" | "Aged Care";
export type JobStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "pending_review";

export type JobNote = {
  author_id: string;
  author_name: string;
  text: string;
  timestamp: string; // ISO
};

export type Job = {
  id: string;
  created_at: string;
  updated_at: string;

  client_id: string | null;
  client_name: string;
  client_type: ClientType;

  address: string | null;
  suburb: string | null;
  postcode: string | null;

  date: string | null;          // YYYY-MM-DD
  scheduled_time: string | null; // HH:MM:SS

  description: string | null;
  status: JobStatus;

  assigned_worker_ids: string[];
  waiting_time_minutes: number;

  notes: JobNote[];
  materials_used: unknown[];
  photos_before: string[];
  photos_after: string[];
  // Receipt photos uploaded by the field worker when they buy
  // materials on the job (Bunnings runs, hardware-store fittings).
  // Same Storage layout as before/after; kept in a separate array so
  // the admin cost view can cross-check uploaded receipts against the
  // catalogue line items at invoice time.
  photos_receipts: string[];
  // Per-worker clock entries, keyed by user id. Each entry is at most
  // one start + optional end (workers can't clock in twice without
  // clocking out first). The `time_log` column is jsonb in Postgres,
  // and the migration in 0018 converts the previous single
  // `{start,end}` shape into this keyed form so all readers can
  // assume the new shape.
  time_log: Record<string, {
    start?: string;
    end?: string;
    // Optional pause intervals during the shift. Each is a
    // { start, end? } pair (the last one's `end` is missing while
    // the worker is currently on break). Break minutes are
    // SUBTRACTED from billable time in calculateCost().
    breaks?: Array<{ start: string; end?: string }>;
  }>;

  invoice_sent: boolean;
  xero_invoice_id: string | null;

  // Quote-stage fields (migration 0022). Populated while the job is
  // in pending_review status and Thomas is preparing a quote. Once
  // the customer accepts in Xero and Thomas flips status to
  // `scheduled`, these stay as a record of what was quoted; the
  // actual invoice on completion uses the real time_log + materials.
  quote_hours_per_worker: number | null;
  quote_worker_count: number | null;
  xero_quote_id: string | null;
  quote_sent_at: string | null;
};

export type WorkerListEntry = {
  id: string;
  name: string;
  colour: string;
};

// Row in the materials_catalogue table, shaped for the /admin/materials
// management UI and the per-job materials picker. Materials are
// purchased per-job; no stock tracking on the catalogue itself.
export type MaterialCatalogueRow = {
  id: string;
  name: string;
  unit: string;
  base_price_cents: number;
  category: string | null;
  active: boolean;
};

export type EnquiryStatus = "new" | "contacted" | "converted" | "closed";

export type Enquiry = {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  suburb: string;
  service_type: string;
  client_type: string | null;
  message: string | null;
  sms_sent: boolean;
  sms_sent_at: string | null;
  status: EnquiryStatus;
  converted_to_job_id: string | null;
  notes: string | null;
};
