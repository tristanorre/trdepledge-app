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
  // Per-worker clock entries, keyed by user id. Each entry is at most
  // one start + optional end (workers can't clock in twice without
  // clocking out first). The `time_log` column is jsonb in Postgres,
  // and the migration in 0018 converts the previous single
  // `{start,end}` shape into this keyed form so all readers can
  // assume the new shape.
  time_log: Record<string, { start?: string; end?: string }>;

  invoice_sent: boolean;
  xero_invoice_id: string | null;
};

export type WorkerListEntry = {
  id: string;
  name: string;
  colour: string;
};

// Row in the materials_catalogue table, shaped for the /admin/materials
// management UI and the per-job materials picker.
export type MaterialCatalogueRow = {
  id: string;
  name: string;
  unit: string;
  base_price_cents: number;
  category: string | null;
  active: boolean;
  quantity_on_hand: number;     // numeric stock tracker (added by migration 0020)
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
