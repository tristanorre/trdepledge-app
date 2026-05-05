"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, type JobMaterialLine } from "@/lib/cost";

type CatalogueItem = {
  id: string;
  name: string;
  unit: string;
  base_price_cents: number;
  category: string | null;
};

type Props = {
  jobId: string;
  initialLines: JobMaterialLine[];
};

function lineTotalCents(l: JobMaterialLine): number {
  return Math.round(l.base_price_cents * l.qty * (1 + l.markup_percent / 100));
}

export default function MaterialsList({ jobId, initialLines }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<JobMaterialLine[]>(initialLines);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("1");
  const [markup, setMarkup] = useState("20");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/materials-catalogue")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCatalogue(d.materials ?? []); })
      .catch(() => { if (!cancelled) setCatalogue([]); });
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    const res = await fetch(`/api/admin/jobs/${jobId}/materials`);
    const data = await res.json();
    setLines(data.lines ?? []);
    router.refresh(); // refresh server component for cost breakdown
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!materialId) return setError("Pick a material");
    const qtyNum = Number(qty);
    const markupNum = Number(markup);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("Quantity must be > 0");
    if (!Number.isFinite(markupNum) || markupNum < 0) return setError("Markup must be ≥ 0");

    setBusy("add");
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/materials`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ material_id: materialId, qty: qtyNum, markup_percent: markupNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add");
      await refresh();
      setMaterialId(""); setQty("1"); setMarkup("20");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function removeLine(lineId: string) {
    if (!confirm("Remove this material?")) return;
    setBusy(lineId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/materials/${lineId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function updateLine(line: JobMaterialLine, patch: { qty?: number; markup_percent?: number }) {
    setBusy(line.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/materials/${line.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)" }}>
          Materials
        </h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={addBtn}
          >
            + Add material
          </button>
        )}
      </div>

      {lines.length === 0 && !adding && (
        <div style={{ color: "var(--gray)", fontSize: 14, padding: "8px 0" }}>
          No materials added yet.
        </div>
      )}

      {lines.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {lines.map((l) => (
            <li key={l.id} style={lineRow}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14 }}>{l.name}</div>
                <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
                  {fmtMoney(l.base_price_cents)} / {l.unit} · {l.markup_percent}% markup
                </div>
              </div>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                defaultValue={l.qty}
                aria-label="Quantity"
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0 && next !== l.qty) {
                    updateLine(l, { qty: next });
                  }
                }}
                style={qtyInput}
              />
              <div style={{ minWidth: 90, textAlign: "right", fontWeight: 800, color: "var(--navy)" }}>
                {fmtMoney(lineTotalCents(l))}
              </div>
              <button
                type="button"
                onClick={() => removeLine(l.id)}
                disabled={busy === l.id}
                aria-label="Remove"
                style={removeBtn}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form onSubmit={addLine} style={addForm}>
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="form-select"
            style={{ flex: "1 1 200px" }}
            required
          >
            <option value="">Choose a material…</option>
            {catalogue.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {fmtMoney(c.base_price_cents)} / {c.unit}
              </option>
            ))}
          </select>
          <input
            type="number" min="0" step="any" inputMode="decimal"
            value={qty} onChange={(e) => setQty(e.target.value)}
            className="form-input" placeholder="Qty"
            style={{ width: 90 }}
            required
          />
          <input
            type="number" min="0" inputMode="numeric"
            value={markup} onChange={(e) => setMarkup(e.target.value)}
            className="form-input" placeholder="% markup"
            style={{ width: 90 }}
            aria-label="Markup percent"
          />
          <button type="submit" disabled={busy === "add"} style={confirmBtn}>
            {busy === "add" ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setError(null); }} style={cancelBtn}>
            Cancel
          </button>
        </form>
      )}

      {error && <div className="form-error" role="alert">⚠ {error}</div>}
    </div>
  );
}

const lineRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "var(--off)", borderRadius: 10, padding: 10,
  flexWrap: "wrap",
};
const qtyInput: React.CSSProperties = {
  width: 80, padding: "8px 10px",
  border: "1.5px solid var(--gray-light)", borderRadius: 8,
  fontSize: 14, textAlign: "right",
};
const removeBtn: React.CSSProperties = {
  background: "transparent", color: "#B91C1C",
  border: "none", padding: 8, cursor: "pointer",
  fontSize: 16, minWidth: 36, minHeight: 36,
  borderRadius: 8,
};
const addBtn: React.CSSProperties = {
  background: "var(--off)", color: "var(--navy)",
  border: "1.5px solid var(--navy)", borderRadius: 8,
  padding: "8px 14px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", minHeight: 36,
};
const addForm: React.CSSProperties = {
  display: "flex", gap: 8, flexWrap: "wrap",
  background: "var(--off)", borderRadius: 10, padding: 10,
  alignItems: "stretch",
  marginBottom: 8,
};
const confirmBtn: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const cancelBtn: React.CSSProperties = {
  background: "transparent", color: "var(--gray)",
  border: "none", padding: "10px 12px", fontSize: 13, cursor: "pointer",
};
