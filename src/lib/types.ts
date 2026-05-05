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
  time_log: Record<string, unknown>;

  invoice_sent: boolean;
  xero_invoice_id: string | null;
};

export type WorkerListEntry = {
  id: string;
  name: string;
  colour: string;
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
