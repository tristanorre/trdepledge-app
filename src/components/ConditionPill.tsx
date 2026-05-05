import type { AssetCondition } from "@/lib/types-inventory";

const COLOURS: Record<AssetCondition, { bg: string; fg: string }> = {
  "Good":          { bg: "rgba(34,134,58,0.14)",  fg: "#15803D" },
  "Needs Service": { bg: "rgba(217,119,6,0.16)",  fg: "#B45309" },
  "Damaged":       { bg: "rgba(220,38,38,0.14)",  fg: "#B91C1C" },
  "In Stock":      { bg: "rgba(168,216,24,0.18)", fg: "#3F5C00" },
  "Out of Stock":  { bg: "rgba(107,114,128,0.18)",fg: "#4B5563" },
};

export default function ConditionPill({ condition }: { condition: AssetCondition }) {
  const c = COLOURS[condition];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: c.bg, color: c.fg,
      fontSize: 11, fontWeight: 800,
      letterSpacing: "0.5px", textTransform: "uppercase",
      padding: "4px 10px", borderRadius: 999,
      whiteSpace: "nowrap",
    }}>
      {condition}
    </span>
  );
}
