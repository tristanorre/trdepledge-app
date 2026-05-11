import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, JobStatus, WorkerListEntry } from "@/lib/types";
import { dayKeyOf, mondayOfWeek, type DayKey } from "@/lib/dates";

export type RosterRow = {
  id: string;
  worker_id: string;
  week_start: string;
  days: DayKey[];
  start_time: string | null;
  end_time: string | null;
};

export type ApprovedLeave = {
  id: string;
  worker_id: string;
  type: string;
  from_date: string;
  to_date: string;
};

export type WorkerDayState = {
  worker: WorkerListEntry;
  rostered: boolean;            // worker on roster for this day
  start_time: string | null;
  end_time: string | null;
  on_leave: boolean;
  leave_type: string | null;
  jobs: Job[];                  // jobs assigned to this worker on this day
};

export type DayScheduleData = {
  date: string;
  workers_state: WorkerDayState[];
};

// Loads everything needed to render a single day's schedule for ALL
// workers. Called from server components — workers' personal views
// pass their own worker_id to filter.
export async function loadDaySchedule(
  supabase: SupabaseClient,
  date: string,
  options: { onlyWorkerId?: string } = {},
): Promise<DayScheduleData> {
  const week = mondayOfWeek(date);
  const dKey = dayKeyOf(date);

  // Pull workers, roster, jobs, leave in parallel.
  const workersQuery = supabase
    .from("users")
    .select("id, name, colour")
    .eq("role", "worker")
    .eq("active", true)
    .order("name");

  const rosterQuery = supabase
    .from("roster")
    .select("id, worker_id, week_start, days, start_time, end_time")
    .eq("week_start", week);

  const jobsQuery = supabase
    .from("jobs")
    .select("*")
    .eq("date", date)
    .neq("status", "cancelled")
    .order("scheduled_time", { ascending: true, nullsFirst: false });

  // Approved leave that overlaps this date.
  const leaveQuery = supabase
    .from("leave_requests")
    .select("id, worker_id, type, from_date, to_date")
    .eq("status", "approved")
    .lte("from_date", date)
    .gte("to_date", date);

  const [workersRes, rosterRes, jobsRes, leaveRes] = await Promise.all([
    options.onlyWorkerId
      ? workersQuery.eq("id", options.onlyWorkerId)
      : workersQuery,
    rosterQuery,
    jobsQuery,
    leaveQuery,
  ]);

  const workers = (workersRes.data ?? []) as WorkerListEntry[];
  const roster = (rosterRes.data ?? []) as RosterRow[];
  const jobs = (jobsRes.data ?? []) as Job[];
  const leave = (leaveRes.data ?? []) as ApprovedLeave[];

  const rosterByWorker = new Map(roster.map((r) => [r.worker_id, r]));
  const leaveByWorker = new Map(leave.map((l) => [l.worker_id, l]));

  const workers_state: WorkerDayState[] = workers.map((w) => {
    const r = rosterByWorker.get(w.id);
    const lv = leaveByWorker.get(w.id);
    return {
      worker: w,
      rostered: r ? r.days.includes(dKey) : false,
      start_time: r?.start_time ?? null,
      end_time: r?.end_time ?? null,
      on_leave: !!lv,
      leave_type: lv?.type ?? null,
      jobs: jobs.filter((j) => j.assigned_worker_ids.includes(w.id)),
    };
  });

  return { date, workers_state };
}

// Slot-level colour resolver for the Time Allocation Board.
// Returns one of: "free" | "scheduled" | "in_progress" | "off" | "leave"
export type SlotColour = "free" | "scheduled" | "in_progress" | "off" | "leave";

export function colourForSlot(state: WorkerDayState, slotStartMins: number): SlotColour {
  // Order of precedence (most → least important):
  //   1. On leave wins everything — workers on leave shouldn't be
  //      doing anything, but if a job somehow lands here we still
  //      surface the leave state so the conflict is visible.
  //   2. A job in this slot wins over roster state. Previously the
  //      `if (!rostered) return "off"` check sat above the job loop,
  //      so any job assigned to a worker without a roster entry for
  //      the day rendered as grey (off-roster) instead of navy
  //      (scheduled) — the whole board looked uniformly grey.
  //   3. Rostered + no job in this slot → free (open & ready).
  //   4. Not rostered → off.
  if (state.on_leave) return "leave";

  // Job overlap: a job starting at scheduled_time is assumed to occupy
  // 60 minutes when no actual time_log exists; once clocked in we use
  // the real elapsed (or scheduled+60) — close enough for the visual.
  for (const j of state.jobs) {
    if (!j.scheduled_time) continue;
    const [h, m] = j.scheduled_time.split(":");
    const startMins = Number(h) * 60 + Number(m);
    const endMins = startMins + 60; // assumed 1h block
    if (slotStartMins >= startMins && slotStartMins < endMins) {
      return j.status === "in_progress" ? "in_progress"
           : j.status === "completed"   ? "in_progress" // visually identical — work happened in the slot
           : "scheduled";
    }
  }

  if (!state.rostered) return "off";
  return "free";
}

// Status → JobStatus type narrower for use in colour resolvers.
export const JOB_STATUS_COLOURS: Record<JobStatus, string> = {
  scheduled:      "#1A4FB5",
  in_progress:    "#D97706",
  completed:      "#15803D",
  cancelled:      "#9CA3AF",
  pending_review: "#857200",
};
