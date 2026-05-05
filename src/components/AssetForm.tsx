"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ASSET_CATEGORIES, ASSET_CONDITIONS,
  type Asset, type AssetCategory, type AssetCondition,
} from "@/lib/types-inventory";
import type { WorkerListEntry } from "@/lib/types";

// Per-category emoji suggestions. Admin can also type any custom emoji.
const ICON_SUGGESTIONS: Record<AssetCategory, string[]> = {
  "Vehicles":         ["🚙", "🚛", "🚜", "🛻", "🚚"],
  "Power Equipment":  ["🌱", "✂️", "🪚", "🪓", "🌳", "🍂", "🚜"],
  "Hand Tools":       ["🛠️", "🔨", "🪛", "🛒", "🧰", "🪣"],
  "Safety & PPE":     ["🦺", "⛑️", "🧤", "👢", "🥽"],
  "Materials Stock":  ["🧴", "🌾", "🪵", "📦", "🧂"],
};

type Props = {
  workers: WorkerListEntry[];
  initial?: Partial<Asset>;
  submitUrl: string;
  submitMethod: "POST" | "PATCH";
};

export default function AssetForm({ workers, initial = {}, submitUrl, submitMethod }: Props) {
  const router = useRouter();

  const [name, setName]               = useState(initial.name ?? "");
  const [identifier, setIdentifier]   = useState(initial.identifier ?? "");
  const [category, setCategory]       = useState<AssetCategory>(initial.category ?? "Power Equipment");
  const [icon, setIcon]               = useState(initial.icon ?? "");
  const [condition, setCondition]     = useState<AssetCondition>(initial.condition ?? "Good");
  const [assignedTo, setAssignedTo]   = useState<string | null>(initial.assigned_to ?? null);
  const [notes, setNotes]             = useState(initial.notes ?? "");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const suggestions = ICON_SUGGESTIONS[category] ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required");
    setSubmitting(true);

    try {
      const res = await fetch(submitUrl, {
        method: submitMethod,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          identifier: identifier.trim() || null,
          category,
          icon: icon.trim() || null,
          condition,
          assigned_to: assignedTo || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      router.push(`/admin/inventory/${data.asset.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div className="form-group">
          <label className="form-label" htmlFor="name">Name *</label>
          <input id="name" className="form-input" type="text" required
            value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="identifier">Identifier (serial / number / rego)</label>
          <input id="identifier" className="form-input" type="text"
            value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. Husqvarna · #003" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="category">Category *</label>
          <select id="category" className="form-select"
            value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
            {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Card>

      <Card title="Icon">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {suggestions.map((sym) => (
            <button
              type="button"
              key={sym}
              onClick={() => setIcon(sym)}
              aria-pressed={icon === sym}
              style={{
                width: 44, height: 44, fontSize: 22,
                background: icon === sym ? "var(--navy)" : "var(--off)",
                border: "none", borderRadius: 10,
                cursor: "pointer",
              }}
            >
              {sym}
            </button>
          ))}
        </div>
        <input
          type="text" maxLength={4}
          value={icon} onChange={(e) => setIcon(e.target.value)}
          className="form-input"
          placeholder="Or paste any emoji"
          style={{ width: 160 }}
          aria-label="Custom icon"
        />
      </Card>

      <Card>
        <div className="form-group">
          <label className="form-label" htmlFor="condition">Condition</label>
          <select id="condition" className="form-select"
            value={condition} onChange={(e) => setCondition(e.target.value as AssetCondition)}>
            {ASSET_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="assigned">Assigned to</label>
          <select id="assigned" className="form-select"
            value={assignedTo ?? ""} onChange={(e) => setAssignedTo(e.target.value || null)}>
            <option value="">Equipment Pool (unassigned)</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="notes">Notes</label>
          <textarea id="notes" className="form-textarea" rows={3}
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Service history, expiry, handling notes…" />
        </div>
      </Card>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}

      <button type="submit" className="form-submit" disabled={submitting}>
        {submitting ? "Saving…" : (submitMethod === "POST" ? "Add asset" : "Save changes")}
      </button>
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
