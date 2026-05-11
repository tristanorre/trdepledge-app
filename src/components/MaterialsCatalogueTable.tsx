"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/cost";
import type { MaterialCatalogueRow } from "@/lib/types";

type Props = {
  initial: MaterialCatalogueRow[];
};

// Editable materials catalogue. Each row is Description / Unit /
// Cost-per-unit. No stock tracking — materials are purchased
// per-job, and the per-job materials line is where Quantity and
// Total Cost come into play. Add a row via the top form; click
// any cell to edit inline; delete via the trash icon. Soft-hides
// (set active=false) are surfaced as "Inactive" pills.

type Draft = {
  name: string;
  unit: string;
  base_price_cents: string;   // string in the form, parsed on submit
  category: string;
};

const EMPTY_DRAFT: Draft = { name: "", unit: "", base_price_cents: "", category: "" };

export default function MaterialsCatalogueTable({ initial }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<MaterialCatalogueRow[]>(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [addingBusy, setAddingBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Convert the form-state "$12.50" string into integer cents. Empty
  // or non-numeric → null so we can reject before hitting the API.
  function dollarsToCents(raw: string): number | null {
    const trimmed = raw.trim().replace(/^\$/, "");
    if (!trimmed) return null;
    const f = Number.parseFloat(trimmed);
    if (!Number.isFinite(f) || f < 0) return null;
    return Math.round(f * 100);
  }

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!draft.name.trim()) return setAddError("Description is required");
    if (!draft.unit.trim())  return setAddError("Unit is required (e.g. m², kg, each, bag)");
    const cents = dollarsToCents(draft.base_price_cents);
    if (cents === null) return setAddError("Enter a cost per unit");

    setAddingBusy(true);
    try {
      const res = await fetch("/api/admin/materials-catalogue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          unit: draft.unit.trim(),
          base_price_cents: cents,
          category: draft.category.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add material");
      setRows((prev) => [...prev, data.material as MaterialCatalogueRow]);
      setDraft(EMPTY_DRAFT);
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add material");
    } finally {
      setAddingBusy(false);
    }
  }

  async function patchRow(id: string, patch: Partial<MaterialCatalogueRow>) {
    setRowBusy(id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/materials-catalogue/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      setRows((prev) => prev.map((r) => (r.id === id ? (data.material as MaterialCatalogueRow) : r)));
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setRowBusy(null);
    }
  }

  async function deleteRow(id: string, name: string) {
    if (!confirm(`Delete "${name}"? If it's been used on any job this will fail — soft-hide it via the Active toggle instead.`)) {
      return;
    }
    setRowBusy(id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/materials-catalogue/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete");
      setRows((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Add form */}
      <form onSubmit={addRow} style={addFormStyle}>
        <h3 style={addTitleStyle}>Add material</h3>
        <div style={gridStyle}>
          <Field label="Description" htmlFor="m-name" flex={2}>
            <input
              id="m-name"
              className="form-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Lawn Turf"
              disabled={addingBusy}
            />
          </Field>
          <Field label="Unit" htmlFor="m-unit">
            <input
              id="m-unit"
              className="form-input"
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              placeholder="m², kg, each…"
              disabled={addingBusy}
            />
          </Field>
          <Field label="Cost / unit ($)" htmlFor="m-price">
            <input
              id="m-price"
              className="form-input"
              value={draft.base_price_cents}
              onChange={(e) => setDraft({ ...draft, base_price_cents: e.target.value })}
              placeholder="12.50"
              inputMode="decimal"
              disabled={addingBusy}
            />
          </Field>
          <Field label="Category" htmlFor="m-cat">
            <input
              id="m-cat"
              className="form-input"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder="optional"
              disabled={addingBusy}
            />
          </Field>
        </div>
        <button type="submit" disabled={addingBusy} style={primaryBtn}>
          {addingBusy ? "Adding…" : "+ Add material"}
        </button>
        {addError && <div role="alert" style={errorStyle}>⚠ {addError}</div>}
      </form>

      {/* Table */}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRow}>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Unit</th>
              <th style={thStyleR}>Cost / unit</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Active</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={emptyCellStyle}>No materials yet — add your first using the form above.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={rowStyle(rowBusy === r.id)}>
                <td style={tdStyle}>
                  <EditableText
                    value={r.name}
                    placeholder="(blank)"
                    onSave={(v) => v && patchRow(r.id, { name: v })}
                  />
                </td>
                <td style={tdStyle}>
                  <EditableText
                    value={r.unit}
                    placeholder="(unit)"
                    onSave={(v) => v && patchRow(r.id, { unit: v })}
                  />
                </td>
                <td style={tdStyleR}>
                  <EditableMoney
                    cents={r.base_price_cents}
                    onSave={(cents) => patchRow(r.id, { base_price_cents: cents })}
                  />
                </td>
                <td style={tdStyle}>{r.category ?? <em style={{ color: "var(--gray)" }}>—</em>}</td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => patchRow(r.id, { active: !r.active })}
                    disabled={rowBusy === r.id}
                    style={r.active ? activePill : inactivePill}
                  >
                    {r.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => deleteRow(r.id, r.name)}
                    disabled={rowBusy === r.id}
                    style={trashBtn}
                    aria-label={`Delete ${r.name}`}
                    title="Delete"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rowError && <div role="alert" style={errorStyle}>⚠ {rowError}</div>}
    </div>
  );
}

// ── Inline-editable cell helpers ────────────────────────────────────

function EditableText({
  value, onSave, placeholder,
}: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        style={editableCellStyle}
        title="Click to edit"
      >
        {value || <em style={{ color: "var(--gray)" }}>{placeholder ?? "(empty)"}</em>}
      </span>
    );
  }
  return (
    <input
      autoFocus
      className="form-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft.trim()); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      style={{ width: "100%" }}
    />
  );
}

function EditableNumber({
  value, onSave, step,
}: { value: number; onSave: (n: number) => void; step?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        style={editableCellStyle}
        title="Click to edit"
      >
        {Number.isFinite(value) ? value : 0}
      </span>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      step={step ?? "1"}
      min="0"
      className="form-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number.parseFloat(draft);
        if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
      }}
      style={{ width: 100, textAlign: "right" }}
    />
  );
}

function EditableMoney({
  cents, onSave,
}: { cents: number; onSave: (cents: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState((cents / 100).toFixed(2));
  if (!editing) {
    return (
      <span
        onClick={() => { setDraft((cents / 100).toFixed(2)); setEditing(true); }}
        style={editableCellStyle}
        title="Click to edit"
      >
        {fmtMoney(cents)}
      </span>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      step="0.01"
      min="0"
      className="form-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const f = Number.parseFloat(draft);
        if (Number.isFinite(f) && f >= 0) {
          const c = Math.round(f * 100);
          if (c !== cents) onSave(c);
        }
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft((cents / 100).toFixed(2)); setEditing(false); }
      }}
      style={{ width: 100, textAlign: "right" }}
    />
  );
}

function Field({
  label, htmlFor, flex = 1, children,
}: { label: string; htmlFor: string; flex?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex }}>
      <label className="form-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const addFormStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 20,
  border: "1px solid rgba(0,0,0,0.06)",
  display: "flex", flexDirection: "column", gap: 12,
};
const addTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", margin: 0,
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
  gap: 12,
};
const primaryBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "var(--navy)", color: "white", border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer",
};
const tableWrapStyle: React.CSSProperties = {
  background: "white", borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.06)",
  overflow: "auto",
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 14,
};
const theadRow: React.CSSProperties = {
  background: "var(--off)",
};
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "10px 12px",
  fontSize: 11, fontWeight: 800, letterSpacing: "0.6px",
  textTransform: "uppercase", color: "var(--gray)",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};
const thStyleR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = {
  padding: "12px", borderBottom: "1px solid rgba(0,0,0,0.04)",
  verticalAlign: "middle",
};
const tdStyleR: React.CSSProperties = { ...tdStyle, textAlign: "right" };
const rowStyle = (busy: boolean): React.CSSProperties => ({
  background: busy ? "rgba(168,216,24,0.06)" : "white",
});
const emptyCellStyle: React.CSSProperties = {
  padding: 24, textAlign: "center",
  color: "var(--gray)", fontSize: 13, fontStyle: "italic",
};
const editableCellStyle: React.CSSProperties = {
  cursor: "text", padding: "2px 4px", borderRadius: 4,
  display: "inline-block", minWidth: 30,
};
const unitHintStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--gray)", marginTop: 2,
};
const activePill: React.CSSProperties = {
  background: "rgba(34,134,58,0.14)", color: "#15803D",
  border: "none", borderRadius: 999,
  padding: "3px 10px", fontSize: 11, fontWeight: 800,
  letterSpacing: "0.4px", textTransform: "uppercase",
  cursor: "pointer",
};
const inactivePill: React.CSSProperties = {
  background: "rgba(0,0,0,0.06)", color: "var(--gray)",
  border: "none", borderRadius: 999,
  padding: "3px 10px", fontSize: 11, fontWeight: 800,
  letterSpacing: "0.4px", textTransform: "uppercase",
  cursor: "pointer",
};
const trashBtn: React.CSSProperties = {
  background: "transparent", border: "none",
  color: "#B91C1C", fontSize: 16, cursor: "pointer",
  padding: "4px 8px",
};
const errorStyle: React.CSSProperties = {
  padding: 10, background: "rgba(220,38,38,0.10)",
  color: "#B91C1C", borderRadius: 8, fontSize: 13, fontWeight: 600,
};
