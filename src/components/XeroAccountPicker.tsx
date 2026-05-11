"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Lazy-loaded picker for the Xero "sales account" code that invoice
// and quote line items reference. Shows on /admin/settings when Xero
// is connected. We fetch the chart of accounts on mount, prefill the
// dropdown with the currently-saved code, and save the new pick via
// PATCH /api/admin/xero/sales-account.
//
// Why this exists: the previous default was a hardcoded "200" (the AU
// template's Sales account), which fails the moment an org archives
// or replaces it. Letting Thomas pick from the live chart removes the
// guesswork — and the env-var redeploy round-trip.

type Account = {
  code: string;
  name: string;
  type: string;
  description: string | null;
};

export default function XeroAccountPicker() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [originalCode, setOriginalCode] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadDetail, setLoadDetail] = useState<unknown>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/xero/accounts");
        const data = await res.json();
        if (!res.ok) {
          if (data?.detail != null && !cancelled) setLoadDetail(data.detail);
          throw new Error(data?.error ?? "Could not load accounts");
        }
        if (cancelled) return;
        const list = (data.accounts ?? []) as Account[];
        setAccounts(list);
        const current = (data.current ?? "") as string;
        setOriginalCode(current);
        // If current code is in the list, select it. Otherwise pick
        // first available so Thomas can save a working one in one tap.
        if (list.some((a) => a.code === current)) {
          setSelected(current);
        } else if (list.length > 0) {
          setSelected(list[0].code);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load accounts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/xero/sales-account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setSaved(true);
      setOriginalCode(selected);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const dirty = selected && selected !== originalCode;

  return (
    <div style={wrapStyle}>
      <div style={labelStyle}>Sales account for invoice lines</div>
      <div style={hintStyle}>
        Pick the revenue account in your Xero chart that labour and
        materials should post to. Required — Xero rejects invoices that
        reference an archived or missing account.
      </div>

      {loading && <div style={muted}>Loading accounts from Xero…</div>}

      {loadError && (
        <div style={errBoxStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <span aria-hidden="true">⚠</span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>{loadError}</span>
          </div>
          {loadDetail != null && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                style={detailToggleStyle}
              >
                {showDetail ? "Hide technical detail" : "Show technical detail"}
              </button>
              {showDetail && (
                <pre style={detailBoxStyle}>{JSON.stringify(loadDetail, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && !loadError && accounts.length === 0 && (
        <div style={errBoxStyle}>
          No active revenue accounts found in your Xero org. Add one in
          Xero (Accounting → Chart of Accounts → Add Account, type
          Revenue) and refresh this page.
        </div>
      )}

      {!loading && !loadError && accounts.length > 0 && (
        <>
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setSaved(false); }}
            disabled={saving}
            style={selectStyle}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              style={btnPrimary}
            >
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
            {originalCode && (
              <span style={muted}>
                Currently: <strong style={{ color: "var(--navy)" }}>{originalCode}</strong>
              </span>
            )}
            {saved && !dirty && (
              <span style={{ color: "#15803D", fontWeight: 700, fontSize: 12 }}>
                ✓ Saved
              </span>
            )}
          </div>
        </>
      )}

      {saveError && (
        <div style={errBoxStyle}>⚠ {saveError}</div>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  marginTop: 14, padding: 14,
  background: "var(--off)", borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.06)",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "0.8px",
  textTransform: "uppercase", color: "var(--navy)", marginBottom: 4,
};
const hintStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--gray)", lineHeight: 1.5, marginBottom: 10,
};
const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px", borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "white", color: "var(--navy)",
  fontSize: 14, fontWeight: 600,
};
const btnPrimary: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "8px 16px", fontSize: 13, fontWeight: 800,
  cursor: "pointer", minHeight: 36,
};
const errBoxStyle: React.CSSProperties = {
  marginTop: 8, padding: 10,
  background: "rgba(220,38,38,0.08)",
  color: "#B91C1C",
  borderRadius: 8, fontSize: 12, lineHeight: 1.5,
};
const detailToggleStyle: React.CSSProperties = {
  background: "transparent", border: "none",
  color: "#B91C1C", fontWeight: 700, fontSize: 12,
  textDecoration: "underline", textUnderlineOffset: "3px",
  cursor: "pointer", padding: 0,
};
const detailBoxStyle: React.CSSProperties = {
  marginTop: 6, padding: 10,
  background: "white", color: "var(--navy)",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 6, fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  overflow: "auto", maxHeight: 280,
  whiteSpace: "pre-wrap", wordBreak: "break-word",
};
const muted: React.CSSProperties = {
  fontSize: 12, color: "var(--gray)",
};
