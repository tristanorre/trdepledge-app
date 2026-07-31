import type { CSSProperties } from "react";

// Shared inline styles for the /admin/hire screens.
//
// The admin app styles with inline objects rather than classes (globals.css
// is the marketing site's stylesheet, and the hire page's own CSS is scoped
// to `.hire-page` so it can't leak in here). Collecting the repeated ones
// keeps the four hire screens consistent and stops the same 12-line style
// object being written out five times.
//
// Sizing note: Thomas reads these on a phone, one-handed, between jobs.
// Tap targets stay at 44px, nothing depends on hover, and every table has a
// card layout underneath it for narrow screens.

export const page: CSSProperties = { maxWidth: 1100 };

export const h1: CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  margin: "0 0 4px",
  color: "var(--navy)",
};

export const lede: CSSProperties = { color: "#6B7280", margin: "0 0 20px", fontSize: 15 };

export const sectionHead: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "1.2px",
  textTransform: "uppercase",
  color: "#6B7280",
  margin: "28px 0 10px",
};

export const card: CSSProperties = {
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 16,
};

export const tileGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

export const tile: CSSProperties = {
  ...card,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export const tileNumber: CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  lineHeight: 1,
  color: "var(--navy)",
};

export const tileLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.6px",
  textTransform: "uppercase",
  color: "#6B7280",
};

export const list: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

export const row: CSSProperties = {
  ...card,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
};

export const rowMain: CSSProperties = { flex: "1 1 220px", minWidth: 0 };

export const rowTitle: CSSProperties = { fontWeight: 700, fontSize: 15, color: "#111827" };

export const rowMeta: CSSProperties = { fontSize: 13, color: "#6B7280", marginTop: 2 };

export const muted: CSSProperties = { color: "#6B7280", fontSize: 14 };

/** Empty states invite an action rather than reporting emptiness. */
export const empty: CSSProperties = {
  border: "1px dashed #D1D5DB",
  borderRadius: 12,
  padding: "22px 18px",
  textAlign: "center",
  color: "#6B7280",
  fontSize: 14,
};

export const filterBar: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  margin: "0 0 16px",
};

export function filterChip(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 38,
    padding: "0 14px",
    borderRadius: 999,
    border: active ? "1.5px solid var(--navy)" : "1.5px solid #E5E7EB",
    background: active ? "var(--navy)" : "white",
    color: active ? "white" : "#374151",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

/** Buttons. 44px minimum so they're hittable with a thumb. */
export function actionButton(tone: "primary" | "quiet" | "danger"): CSSProperties {
  const base: CSSProperties = {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: "1.5px solid transparent",
    whiteSpace: "nowrap",
  };
  if (tone === "primary") return { ...base, background: "var(--navy)", color: "white" };
  if (tone === "danger")
    return { ...base, background: "white", color: "#B91C1C", borderColor: "#FCA5A5" };
  return { ...base, background: "white", color: "#374151", borderColor: "#E5E7EB" };
}

export const linkish: CSSProperties = {
  color: "var(--navy)",
  fontWeight: 700,
  fontSize: 13,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

export const errorText: CSSProperties = {
  color: "#B91C1C",
  fontSize: 13,
  fontWeight: 600,
  margin: "8px 0 0",
};
