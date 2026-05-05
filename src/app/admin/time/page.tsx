import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { loadDaySchedule, colourForSlot, type SlotColour, type WorkerDayState } from "@/lib/schedule";
import { fmtDayLong, todayISO, minutesToLabel } from "@/lib/dates";
import DateSelector from "@/components/DateSelector";

export const dynamic = "force-dynamic";

// 15-minute slots from 06:00 to 18:00 = 48 slots.
const FIRST_MIN = 6 * 60;   // 06:00
const LAST_MIN  = 18 * 60;  // 18:00 exclusive
const SLOT_WIDTH = 24;       // px per 15-min slot
const ROW_HEIGHT = 44;       // px per worker row (>= 44 for touch)

function buildSlots(): number[] {
  const out: number[] = [];
  for (let m = FIRST_MIN; m < LAST_MIN; m += 15) out.push(m);
  return out;
}

const COLOUR_MAP: Record<SlotColour, { bg: string; border: string }> = {
  free:        { bg: "rgba(34,134,58,0.12)",  border: "rgba(34,134,58,0.25)" },
  scheduled:   { bg: "rgba(26,79,181,0.6)",   border: "rgba(26,79,181,0.9)" },
  in_progress: { bg: "rgba(217,119,6,0.7)",   border: "rgba(217,119,6,0.95)" },
  off:         { bg: "rgba(107,114,128,0.18)",border: "rgba(107,114,128,0.3)" },
  leave:       { bg: "rgba(255,229,0,0.55)",  border: "rgba(255,229,0,0.85)" },
};

export default async function TimeAllocationBoardPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : todayISO();

  const slots = buildSlots();

  if (!supabase) {
    return (
      <div>
        <h1 style={titleStyle}>Time</h1>
        <Banner>Supabase not configured.</Banner>
      </div>
    );
  }

  const data = await loadDaySchedule(supabase, date);

  // Compute "now marker" only when viewing today.
  const isToday = date === todayISO();
  const now = new Date();
  const nowMins = isToday ? now.getHours() * 60 + now.getMinutes() : null;
  const nowOffsetPx =
    nowMins !== null && nowMins >= FIRST_MIN && nowMins < LAST_MIN
      ? ((nowMins - FIRST_MIN) / 15) * SLOT_WIDTH
      : null;

  return (
    <div>
      <h1 style={titleStyle}>Time</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
        {fmtDayLong(date)} · 06:00–18:00 in 15-min slots
      </p>

      <DateSelector current={date} />

      <Legend />

      {data.workers_state.length === 0 ? (
        <Empty>No active workers found.</Empty>
      ) : (
        <div style={boardWrap}>
          <div style={{ minWidth: 140 + slots.length * SLOT_WIDTH }}>
            <SlotHeader slots={slots} />
            <div style={{ position: "relative" }}>
              {data.workers_state.map((w) => (
                <WorkerRow key={w.worker.id} state={w} slots={slots} date={date} />
              ))}
              {nowOffsetPx !== null && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 140 + nowOffsetPx,
                    top: 0, bottom: 0,
                    width: 2,
                    background: "var(--yellow)",
                    boxShadow: "0 0 8px rgba(255,229,0,0.6)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{
        marginTop: 16, padding: 14, background: "rgba(168, 216, 24, 0.16)",
        borderRadius: 12, fontSize: 13, color: "#3F5C00",
      }}>
        <strong>Tap any green slot</strong> to start a new job at that time, pre-assigned
        to that worker. Already-scheduled and on-leave slots are read-only.
      </div>
    </div>
  );
}

function SlotHeader({ slots }: { slots: number[] }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--gray-light)", background: "white" }}>
      <div style={{ width: 140, flexShrink: 0, fontSize: 11, fontWeight: 800, color: "var(--gray)", padding: "8px 10px", letterSpacing: "1px", textTransform: "uppercase" }}>
        Worker
      </div>
      <div style={{ display: "flex", position: "relative" }}>
        {slots.map((m) => {
          // Label every hour, dim half-hours.
          const isHour = m % 60 === 0;
          const isHalf = m % 30 === 0;
          return (
            <div
              key={m}
              style={{
                width: SLOT_WIDTH,
                fontSize: 9,
                color: isHour ? "var(--navy)" : "var(--gray)",
                fontWeight: isHour ? 800 : 500,
                textAlign: "left",
                padding: "8px 0 6px 2px",
                borderLeft: isHour
                  ? "1px solid var(--gray-light)"
                  : isHalf
                  ? "1px dashed rgba(107,114,128,0.3)"
                  : "none",
                opacity: isHour ? 1 : 0.55,
                whiteSpace: "nowrap",
              }}
            >
              {isHour ? minutesToLabel(m) : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkerRow({ state, slots, date }: { state: WorkerDayState; slots: number[]; date: string }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--gray-light)" }}>
      <div style={{
        width: 140, flexShrink: 0, padding: "8px 10px",
        display: "flex", alignItems: "center", gap: 8,
        background: "white", height: ROW_HEIGHT,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: state.worker.colour, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {state.worker.name}
        </span>
      </div>

      <div style={{ display: "flex", height: ROW_HEIGHT, position: "relative" }}>
        {slots.map((m) => {
          const colour = colourForSlot(state, m);
          const c = COLOUR_MAP[colour];
          const baseStyle: React.CSSProperties = {
            width: SLOT_WIDTH,
            height: ROW_HEIGHT,
            background: c.bg,
            borderRight: "1px solid rgba(255,255,255,0.4)",
            borderTop: m % 60 === 0 ? "1px solid var(--gray-light)" : "none",
          };
          // Free slots are tappable: prefill the new-job form with the
          // slot's date/time and the worker as initial assignee.
          if (colour === "free") {
            const hh = String(Math.floor(m / 60)).padStart(2, "0");
            const mm = String(m % 60).padStart(2, "0");
            const href = `/admin/jobs/new?date=${date}&time=${hh}:${mm}&worker=${state.worker.id}`;
            return (
              <Link
                key={m}
                href={href}
                title={`${minutesToLabel(m)} — assign ${state.worker.name}`}
                style={{ ...baseStyle, display: "block", cursor: "pointer" }}
              />
            );
          }
          return (
            <div
              key={m}
              title={`${minutesToLabel(m)} — ${colour}`}
              style={baseStyle}
            />
          );
        })}
        {/* Job labels overlaid on the row, positioned by scheduled_time */}
        {state.jobs.map((j) => {
          if (!j.scheduled_time) return null;
          const [h, mm] = j.scheduled_time.split(":");
          const startMins = Number(h) * 60 + Number(mm);
          if (startMins < FIRST_MIN || startMins >= LAST_MIN) return null;
          const left = ((startMins - FIRST_MIN) / 15) * SLOT_WIDTH;
          return (
            <div
              key={j.id}
              style={{
                position: "absolute",
                left: left + 2,
                top: 4,
                fontSize: 10,
                fontWeight: 800,
                color: "white",
                textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                maxWidth: SLOT_WIDTH * 4 - 4, // 1h block
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {j.client_name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const items: Array<[SlotColour, string]> = [
    ["free",        "Available"],
    ["scheduled",   "Scheduled"],
    ["in_progress", "In progress"],
    ["leave",       "On leave"],
    ["off",         "Off roster"],
  ];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, fontSize: 12 }}>
      {items.map(([k, label]) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 14, height: 14, borderRadius: 4,
            background: COLOUR_MAP[k].bg,
            border: `1.5px solid ${COLOUR_MAP[k].border}`,
            display: "inline-block",
          }} />
          <span style={{ color: "var(--gray)" }}>{label}</span>
        </span>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 32,
      textAlign: "center", color: "var(--gray)", fontSize: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {children}
    </div>
  );
}
function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      background: "rgba(255, 229, 0, 0.18)",
      border: "1px solid rgba(133, 114, 0, 0.3)",
      color: "#857200", padding: "12px 16px", borderRadius: 10,
      fontSize: 14,
    }}>
      {children}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const boardWrap: React.CSSProperties = {
  background: "white", borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.06)",
  overflowX: "auto",
  // tightening some spacing — board is dense by nature
  fontFamily: "var(--font-body)",
};
