"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ASSET_CONDITIONS,
  type Asset, type AssetCondition,
} from "@/lib/types-inventory";
import type { WorkerListEntry } from "@/lib/types";

type Props = {
  asset: Asset;
  workers: WorkerListEntry[];
};

export default function AssetManagePanel({ asset, workers }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);

  // Local optimistic state — flipped immediately, server confirms on
  // refresh.
  const [condition, setCondition] = useState<AssetCondition>(asset.condition);
  const [assignedTo, setAssignedTo] = useState<string | null>(asset.assigned_to);
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);

  async function patch(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory/${asset.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Assignment">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="assigned">Assigned to</label>
          <select
            id="assigned"
            className="form-select"
            value={assignedTo ?? ""}
            onChange={(e) => {
              const next = e.target.value || null;
              setAssignedTo(next);
              patch({ assigned_to: next }, "assign");
            }}
            disabled={busy !== null}
          >
            <option value="">Equipment Pool (unassigned)</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div style={hintStyle}>
            Changing this writes an entry to the audit log.
          </div>
        </div>

        {assignedTo && (
          <button
            type="button"
            onClick={() => {
              setAssignedTo(null);
              patch({ assigned_to: null }, "return");
            }}
            disabled={busy !== null}
            style={{ ...secondaryBtn, marginTop: 12 }}
          >
            {busy === "return" ? "Returning…" : "↩ Return to pool"}
          </button>
        )}
      </Card>

      <Card title="Condition">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="condition">Current condition</label>
          <select
            id="condition"
            className="form-select"
            value={condition}
            onChange={(e) => {
              const next = e.target.value as AssetCondition;
              setCondition(next);
              patch({ condition: next }, "condition");
            }}
            disabled={busy !== null}
          >
            {ASSET_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Card>

      <Card title="Notes">
        {editingNotes ? (
          <>
            <textarea
              className="form-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Service history, handling notes, expiries…"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  await patch({ notes }, "notes");
                  setEditingNotes(false);
                }}
                disabled={busy !== null}
                style={primaryBtn}
              >
                {busy === "notes" ? "Saving…" : "Save notes"}
              </button>
              <button
                type="button"
                onClick={() => { setNotes(asset.notes ?? ""); setEditingNotes(false); }}
                disabled={busy !== null}
                style={cancelBtn}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: notes ? "var(--black)" : "var(--gray)", whiteSpace: "pre-wrap", marginBottom: 12 }}>
              {notes || <em>No notes.</em>}
            </div>
            <button type="button" onClick={() => setEditingNotes(true)} style={secondaryBtn}>
              {asset.notes ? "Edit notes" : "Add notes"}
            </button>
          </>
        )}
      </Card>

      {/* Destructive: delete the asset entirely. Confirms once,
          drops the row + its uploaded image, then bounces back to
          the inventory list. The audit log keeps a record. */}
      <Card title="Danger zone">
        <p style={hintStyle}>
          Removes this asset and its uploaded image. The audit log keeps a record of the deletion.
        </p>
        <button
          type="button"
          onClick={async () => {
            if (!confirm(`Delete "${asset.name}" from inventory? This can't be undone.`)) return;
            setBusy("delete");
            setError(null);
            try {
              const res = await fetch(`/api/admin/inventory/${asset.id}`, { method: "DELETE" });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error ?? "Could not delete");
              router.push("/admin/inventory");
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not delete");
              setBusy(null);
            }
          }}
          disabled={busy !== null}
          style={dangerBtn}
        >
          {busy === "delete" ? "Deleting…" : "Delete this asset"}
        </button>
      </Card>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 14, padding: 16,
      border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
        textTransform: "uppercase", color: "var(--gray)", marginBottom: 12,
      }}>{title}</div>
      {children}
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--gray)", marginTop: 6,
};
const primaryBtn: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const secondaryBtn: React.CSSProperties = {
  background: "transparent", color: "var(--navy)",
  border: "1.5px solid var(--navy)", borderRadius: 8,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const cancelBtn: React.CSSProperties = {
  background: "transparent", color: "var(--gray)",
  border: "none", padding: "10px 16px", fontSize: 13,
  cursor: "pointer", minHeight: 40,
};
const dangerBtn: React.CSSProperties = {
  background: "#FEE2E2", color: "#B91C1C",
  border: "1px solid #FCA5A5", borderRadius: 8,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 40, marginTop: 8,
};
