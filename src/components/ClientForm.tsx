"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ClientType = "Private" | "NDIS" | "Aged Care" | "Commercial";
type FundingType = "self" | "plan" | "agency";

type ClientShape = {
  id?: string;
  name: string;
  type: ClientType;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  ndis_participant_number: string | null;
  plan_manager_name: string | null;
  plan_manager_email: string | null;
  plan_manager_phone: string | null;
  ndis_funding_type: FundingType | null;
  notes: string | null;
  // Service-frequency tracking (added in 0020). `service_frequency_days`
  // = the recurrence interval in days (7 = weekly, 14 = fortnightly,
  // 28 = monthly approx). `next_service_due` is the date the next job
  // is expected — typed as ISO YYYY-MM-DD in the API.
  service_frequency_days: number | null;
  next_service_due: string | null;
};

type Props = {
  initial?: Partial<ClientShape>;
  submitUrl: string;
  submitMethod: "POST" | "PATCH";
  showDelete?: boolean;
  deleteUrl?: string;
};

const TYPES: ClientType[] = ["Private", "NDIS", "Aged Care", "Commercial"];

export default function ClientForm({ initial = {}, submitUrl, submitMethod, showDelete, deleteUrl }: Props) {
  const router = useRouter();
  const [s, setS] = useState<ClientShape>({
    name: initial.name ?? "",
    type: (initial.type as ClientType) ?? "Private",
    address: initial.address ?? null,
    suburb: initial.suburb ?? null,
    postcode: initial.postcode ?? null,
    phone: initial.phone ?? null,
    email: initial.email ?? null,
    ndis_participant_number: initial.ndis_participant_number ?? null,
    plan_manager_name: initial.plan_manager_name ?? null,
    plan_manager_email: initial.plan_manager_email ?? null,
    plan_manager_phone: initial.plan_manager_phone ?? null,
    ndis_funding_type: (initial.ndis_funding_type as FundingType) ?? null,
    notes: initial.notes ?? null,
    service_frequency_days: initial.service_frequency_days ?? null,
    next_service_due: initial.next_service_due ?? null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ClientShape>(key: K, value: ClientShape[K]) {
    setS((cur) => ({ ...cur, [key]: value }));
  }
  function setStr<K extends keyof ClientShape>(key: K, value: string) {
    set(key, (value || null) as ClientShape[K]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!s.name.trim()) return setError("Name is required");
    setSubmitting(true);
    try {
      const res = await fetch(submitUrl, {
        method: submitMethod,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...s, name: s.name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.push(`/admin/clients/${data.client.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!deleteUrl) return;
    if (!confirm("Delete this client? Their jobs (if any) will block deletion.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(deleteUrl, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete failed");
      }
      router.push("/admin/clients");
      router.refresh();
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const isNdis = s.type === "NDIS";

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div className="form-group">
          <label className="form-label" htmlFor="name">Name *</label>
          <input id="name" className="form-input" type="text" required
            value={s.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="type">Type *</label>
          <select id="type" className="form-select"
            value={s.type} onChange={(e) => set("type", e.target.value as ClientType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </Card>

      <Card title="Contact">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="phone">Phone</label>
            <input id="phone" className="form-input" type="tel"
              value={s.phone ?? ""} onChange={(e) => setStr("phone", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input id="email" className="form-input" type="email"
              value={s.email ?? ""} onChange={(e) => setStr("email", e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="address">Address</label>
          <input id="address" className="form-input" type="text"
            value={s.address ?? ""} onChange={(e) => setStr("address", e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="suburb">Suburb</label>
            <input id="suburb" className="form-input" type="text"
              value={s.suburb ?? ""} onChange={(e) => setStr("suburb", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="postcode">Postcode</label>
            <input id="postcode" className="form-input" type="text" inputMode="numeric"
              value={s.postcode ?? ""} onChange={(e) => setStr("postcode", e.target.value)} />
          </div>
        </div>
      </Card>

      {isNdis && (
        <Card title="NDIS">
          <div className="form-group">
            <label className="form-label" htmlFor="participant_number">Participant number</label>
            <input id="participant_number" className="form-input" type="text"
              value={s.ndis_participant_number ?? ""} onChange={(e) => setStr("ndis_participant_number", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="funding_type">Funding type</label>
            <select id="funding_type" className="form-select"
              value={s.ndis_funding_type ?? ""}
              onChange={(e) => set("ndis_funding_type", (e.target.value || null) as FundingType | null)}>
              <option value="">—</option>
              <option value="self">Self-managed</option>
              <option value="plan">Plan-managed</option>
              <option value="agency">Agency-managed</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pm_name">Plan manager name</label>
            <input id="pm_name" className="form-input" type="text"
              value={s.plan_manager_name ?? ""} onChange={(e) => setStr("plan_manager_name", e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="pm_email">Plan manager email</label>
              <input id="pm_email" className="form-input" type="email"
                value={s.plan_manager_email ?? ""} onChange={(e) => setStr("plan_manager_email", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pm_phone">Plan manager phone</label>
              <input id="pm_phone" className="form-input" type="tel"
                value={s.plan_manager_phone ?? ""} onChange={(e) => setStr("plan_manager_phone", e.target.value)} />
            </div>
          </div>
        </Card>
      )}

      <Card title="Recurring service">
        <p style={{ fontSize: 13, color: "var(--gray)", marginTop: 0, marginBottom: 12 }}>
          If this client is on a recurring schedule (weekly, fortnightly, monthly), set the
          interval here. The Schedule and Dashboard views will flag them when the next
          service is due so they get rostered automatically.
        </p>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="freq">Frequency</label>
            <select
              id="freq"
              className="form-select"
              value={s.service_frequency_days ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                set("service_frequency_days", v === "" ? null : Number(v));
              }}
            >
              <option value="">One-off / no schedule</option>
              <option value="7">Weekly</option>
              <option value="14">Fortnightly</option>
              <option value="21">Every 3 weeks</option>
              <option value="28">Every 4 weeks (monthly)</option>
              <option value="42">Every 6 weeks</option>
              <option value="56">Every 8 weeks</option>
              <option value="84">Quarterly (12 weeks)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="due">Next service due</label>
            <input
              id="due"
              type="date"
              className="form-input"
              value={s.next_service_due ?? ""}
              onChange={(e) => setStr("next_service_due", e.target.value)}
              disabled={s.service_frequency_days == null}
            />
          </div>
        </div>
      </Card>

      <Card title="Notes">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <textarea className="form-textarea" rows={3}
            value={s.notes ?? ""} onChange={(e) => setStr("notes", e.target.value)}
            placeholder="Anything Thomas needs to remember about this client" />
        </div>
      </Card>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={submitting} className="form-submit" style={{ flex: 1, marginTop: 0 }}>
          {submitting ? "Saving…" : (submitMethod === "POST" ? "Add client" : "Save changes")}
        </button>
        {showDelete && (
          <button type="button" onClick={onDelete} disabled={deleting}
            style={{
              background: "transparent", color: "#B91C1C",
              border: "1.5px solid #B91C1C", borderRadius: 10,
              padding: "12px 18px", fontSize: 15, fontWeight: 700,
              cursor: "pointer", minHeight: 44,
            }}>
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
      background: "white", borderRadius: 14, padding: 16,
      border: "1px solid rgba(0,0,0,0.06)",
    }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
          textTransform: "uppercase", color: "var(--gray)", marginBottom: 12,
        }}>{title}</div>
      )}
      {children}
    </div>
  );
}
