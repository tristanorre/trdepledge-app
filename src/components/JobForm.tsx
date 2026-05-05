"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientType, Job, JobStatus, WorkerListEntry } from "@/lib/types";

type Props = {
  initial?: Partial<Job>;
  workers: WorkerListEntry[];
  submitUrl: string;
  submitMethod: "POST" | "PATCH";
  redirectAfter?: (job: Job) => string;
  showStatus?: boolean;
  showDelete?: boolean;
  deleteUrl?: string;
};

const STATUSES: { value: JobStatus; label: string }[] = [
  { value: "scheduled",      label: "Scheduled" },
  { value: "in_progress",    label: "In progress" },
  { value: "completed",      label: "Completed" },
  { value: "cancelled",      label: "Cancelled" },
  { value: "pending_review", label: "Pending review" },
];

const CLIENT_TYPES: ClientType[] = ["Private", "NDIS", "Aged Care"];

export default function JobForm({
  initial = {},
  workers,
  submitUrl,
  submitMethod,
  redirectAfter,
  showStatus = false,
  showDelete = false,
  deleteUrl,
}: Props) {
  const router = useRouter();

  const [clientName, setClientName]   = useState(initial.client_name ?? "");
  const [clientType, setClientType]   = useState<ClientType>(initial.client_type ?? "Private");
  const [address, setAddress]         = useState(initial.address ?? "");
  const [suburb, setSuburb]           = useState(initial.suburb ?? "");
  const [postcode, setPostcode]       = useState(initial.postcode ?? "");
  const [date, setDate]               = useState(initial.date ?? "");
  const [time, setTime]               = useState((initial.scheduled_time ?? "").slice(0, 5));
  const [description, setDescription] = useState(initial.description ?? "");
  const [status, setStatus]           = useState<JobStatus>(initial.status ?? "scheduled");
  const [assigned, setAssigned]       = useState<string[]>(initial.assigned_worker_ids ?? []);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleWorker(id: string) {
    setAssigned((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      client_name: clientName.trim(),
      client_type: clientType,
      address: address.trim() || null,
      suburb: suburb.trim() || null,
      postcode: postcode.trim() || null,
      date: date || null,
      scheduled_time: time || null,
      description: description.trim() || null,
      assigned_worker_ids: assigned,
      ...(showStatus ? { status } : {}),
    };

    try {
      const res = await fetch(submitUrl, {
        method: submitMethod,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save job");
      const next = redirectAfter ? redirectAfter(data.job) : `/admin/jobs/${data.job.id}`;
      router.push(next);
      router.refresh();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function onDelete() {
    if (!deleteUrl) return;
    if (!confirm("Delete this job? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(deleteUrl, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete");
      }
      router.push("/admin/jobs");
      router.refresh();
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div className="form-group">
          <label className="form-label" htmlFor="client_name">Client name *</label>
          <input id="client_name" className="form-input" type="text" required
            value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="client_type">Client type *</label>
          <select id="client_type" className="form-select"
            value={clientType} onChange={(e) => setClientType(e.target.value as ClientType)}>
            {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {clientType === "NDIS" && (
            <div style={hintStyle}>
              NDIS jobs auto-include support item code <strong>01_019_0120_1_1</strong> on
              the invoice (rate $56.98/hr/worker).
            </div>
          )}
        </div>
      </Card>

      <Card title="Address">
        <div className="form-group">
          <label className="form-label" htmlFor="address">Street address</label>
          <input id="address" className="form-input" type="text"
            value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="suburb">Suburb</label>
            <input id="suburb" className="form-input" type="text"
              value={suburb} onChange={(e) => setSuburb(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="postcode">Postcode</label>
            <input id="postcode" className="form-input" type="text" inputMode="numeric"
              value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card title="Schedule">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="date">Date</label>
            <input id="date" className="form-input" type="date"
              value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="time">Time</label>
            <input id="time" className="form-input" type="time"
              value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        {showStatus && (
          <div className="form-group">
            <label className="form-label" htmlFor="status">Status</label>
            <select id="status" className="form-select"
              value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
      </Card>

      <Card title="Workers">
        {workers.length === 0 ? (
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            No active workers found. Add workers in the HR module (Slice 5) or seed the database.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {workers.map((w) => {
              const on = assigned.includes(w.id);
              return (
                <button
                  type="button"
                  key={w.id}
                  onClick={() => toggleWorker(w.id)}
                  aria-pressed={on}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: on ? "var(--navy)" : "var(--off)",
                    color: on ? "white" : "var(--navy)",
                    border: "none", borderRadius: 999,
                    padding: "8px 14px",
                    fontSize: 14, fontWeight: 600,
                    cursor: "pointer",
                    minHeight: 40,
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: w.colour, display: "inline-block",
                    border: on ? "2px solid white" : "2px solid transparent",
                  }} />
                  {w.name}
                  {on && <span aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Description">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label sr-only" htmlFor="description">Description</label>
          <textarea id="description" className="form-textarea"
            placeholder="What needs to be done?"
            value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </Card>

      {error && <div className="form-error" role="alert" style={{ textAlign: "center" }}>⚠ {error}</div>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={submitting} className="form-submit" style={{ flex: 1, marginTop: 0 }}>
          {submitting ? "Saving…" : (submitMethod === "POST" ? "Create job" : "Save changes")}
        </button>
        {showDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            style={{
              background: "transparent",
              color: "#B91C1C",
              border: "1.5px solid #B91C1C",
              borderRadius: 10,
              padding: "12px 18px",
              fontSize: 15, fontWeight: 700,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </form>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 14,
      padding: 16, border: "1px solid rgba(0,0,0,0.06)",
    }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
          textTransform: "uppercase", color: "var(--gray)",
          marginBottom: 12,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--gray)", marginTop: 6, lineHeight: 1.5,
};
