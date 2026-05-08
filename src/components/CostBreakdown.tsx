import { fmtMoney, type CostBreakdown } from "@/lib/cost";

type Props = { cost: CostBreakdown; isComplete: boolean };

function fmtHours(h: number): string {
  if (h <= 0) return "0h";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  if (hh <= 0) return `${mm}m`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
}

export default function CostBreakdown({ cost, isComplete }: Props) {
  return (
    <div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", marginBottom: 12 }}>
        Cost breakdown
      </h3>

      {!isComplete && cost.hours === 0 && (
        <div style={{ color: "var(--gray)", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          Workers haven&apos;t clocked in yet. Labour will fill in once they do.
        </div>
      )}

      <Row label="Rate"
           detail={`${fmtMoney(cost.rate_cents)}/hr · ${fmtMoney(Math.round(cost.rate_cents / 4))} per 15-min block · ${cost.worker_count} worker${cost.worker_count === 1 ? "" : "s"} assigned`}
           amount={null} />

      {/* Split the labour total so Thomas can see the first-hour
          minimum and any 15-min overtime separately. The "Labour
          subtotal" row shows the sum that hits the invoice. */}
      {cost.first_hour_cents > 0 && (
        <Row label="First hour minimum"
             detail={`${cost.workers_billed} worker${cost.workers_billed === 1 ? "" : "s"} on site · 1h × ${fmtMoney(cost.rate_cents)}`}
             amount={fmtMoney(cost.first_hour_cents)}
             indent />
      )}
      {cost.overtime_blocks > 0 && (
        <Row label="Overtime"
             detail={`${cost.overtime_blocks} × 15-min block${cost.overtime_blocks === 1 ? "" : "s"} × ${fmtMoney(Math.round(cost.rate_cents / 4))}`}
             amount={fmtMoney(cost.overtime_cents)}
             indent />
      )}
      <Row label="Labour subtotal"
           detail={`${fmtHours(cost.hours)} on site${!isComplete && cost.hours > 0 ? " (so far)" : ""}${cost.waiting_hours > 0 ? ` + ${fmtHours(cost.waiting_hours)} waiting (per worker)` : ""} · billed ${fmtHours(cost.billed_hours)}`}
           amount={fmtMoney(cost.labour_cents)}
           bold />

      {/* Waiting time is now folded into labour (it adds to each
          clocked-in worker's billable minutes). Show it for
          transparency, but no separate dollar charge. */}
      {cost.waiting_hours > 0 && (
        <Row label="Waiting time"
             detail={`${fmtHours(cost.waiting_hours)} recorded · billed as part of labour`}
             amount={null}
             indent />
      )}

      {cost.material_lines.length === 0 ? (
        <Row label="Materials" detail="No lines added" amount={fmtMoney(0)} />
      ) : (
        <>
          {cost.material_lines.map((m) => (
            <Row
              key={m.id}
              label={m.name}
              detail={`${m.qty}× ${m.unit} · ${fmtMoney(m.base_cents)} +${m.markup_percent}%`}
              amount={fmtMoney(m.line_total_cents)}
              indent
            />
          ))}
          <Row label="Materials subtotal" detail="" amount={fmtMoney(cost.materials_cents)} bold />
        </>
      )}

      <div style={totalRow}>
        <span>Total</span>
        <span>{fmtMoney(cost.total_cents)}</span>
      </div>
    </div>
  );
}

function Row({
  label, detail, amount, indent, bold,
}: {
  label: string;
  detail: string;
  amount: string | null;
  indent?: boolean;
  bold?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
      padding: "8px 0",
      paddingLeft: indent ? 12 : 0,
      borderBottom: "1px solid var(--gray-light)",
      fontSize: 14,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: bold ? 700 : 600, color: "var(--navy)" }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>{detail}</div>}
      </div>
      {amount !== null && (
        <div style={{ fontWeight: bold ? 800 : 600, color: "var(--navy)", whiteSpace: "nowrap" }}>{amount}</div>
      )}
    </div>
  );
}

const totalRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between",
  marginTop: 12, padding: "16px 14px",
  background: "var(--navy)", color: "white",
  borderRadius: 10,
  fontFamily: "var(--font-display)", fontSize: 22,
};
