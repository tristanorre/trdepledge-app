import type { SupabaseClient } from "@supabase/supabase-js";
import { mondayOfWeek, addDaysISO, todayISO, toISODate } from "@/lib/dates";
import { hoursForEntry, type TimeEntry } from "@/lib/cost";
import { sendPush } from "@/lib/onesignal";

// Weekly milestone notifications. When a worker crosses a threshold of
// Mon-Fri net hours, fire a celebration push to everyone (workers +
// admins) with the milestone's hero image. Each milestone fires at
// most once per ISO week per worker — the unique constraint on
// `worker_milestone_fires` is the dedupe lock, no race window.
//
// To add a new milestone:
//   1. Drop the image into /public/notifications/<filename>.png
//   2. Add an entry to WEEKLY_MILESTONES with a fresh `key`
//   3. Done — the check runs on every clock action + admin time edit

type WeeklyMilestone = {
  /** Stable identifier — the table PK component. Never rename once shipped. */
  key: string;
  /** Case-insensitive substring on users.name. */
  workerNameMatch: string;
  /** Net hours (break-deducted) Mon-Fri that triggers the fire. */
  thresholdHours: number;
  title: string;
  message: string;
  /** Path under /public — absolute URL is built at send time. */
  imagePath: string;
};

const WEEKLY_MILESTONES: WeeklyMilestone[] = [
  {
    key: "super_darrell_15h",
    // Full surname kept in the matcher so a future "Darrell <other>"
    // worker doesn't trigger this celebration by accident. Substring,
    // case-insensitive — "Darrell Woods", "darrell woods", "DARRELL
    // WOODS" all match. If his row is stored with a middle initial
    // ("Darrell J. Woods") the substring breaks; widen this if so.
    workerNameMatch: "darrell woods",
    thresholdHours: 15,
    title: "🏈 SUPER DARRELL!",
    message: "Darrell has crushed 15 hours this week — absolute legend. Go Roos!",
    imagePath: "/notifications/super-darrell-15h.png",
  },
];

/**
 * Best-effort milestone check. Call after any clock action or admin
 * time edit that affects a worker's hours. Returns when done; safe to
 * await — never throws, errors are logged.
 *
 * The check is cheap: one users lookup, one jobs query for the week,
 * one insert per crossed milestone. Skips immediately if the worker
 * doesn't match any milestone's name matcher.
 */
export async function checkWeeklyMilestones(
  supabase: SupabaseClient,
  affectedWorkerId: string,
): Promise<void> {
  try {
    // Resolve the worker first so we can short-circuit if their name
    // doesn't match any milestone — the most common path, so we want
    // to bail out before doing the heavier hours query.
    const { data: user } = await supabase
      .from("users")
      .select("id, name, active")
      .eq("id", affectedWorkerId)
      .maybeSingle();
    if (!user || user.active === false) return;

    const name = String(user.name ?? "").toLowerCase();
    const matching = WEEKLY_MILESTONES.filter((m) =>
      name.includes(m.workerNameMatch.toLowerCase()),
    );
    if (matching.length === 0) return;

    // Compute Mon-Fri net hours for the worker. We bracket the SQL
    // filter loosely on jobs.date to catch jobs whose scheduled date
    // sits at the week edge but were clocked into an adjacent day,
    // then re-bucket by actual clock-in date in JS.
    const today = todayISO();
    const weekStart = mondayOfWeek(today);
    const friExcl = addDaysISO(weekStart, 5); // Mon-Fri: start < Saturday
    const queryFrom = addDaysISO(weekStart, -1);
    const queryTo = addDaysISO(weekStart, 6);

    const { data: jobs } = await supabase
      .from("jobs")
      .select("time_log")
      .contains("assigned_worker_ids", [affectedWorkerId])
      .gte("date", queryFrom)
      .lte("date", queryTo);
    if (!jobs) return;

    let weeklyHours = 0;
    for (const j of jobs) {
      const log = (j.time_log ?? {}) as Record<string, TimeEntry>;
      const entry = log[affectedWorkerId];
      if (!entry?.start) continue;
      const startISO = toISODate(new Date(entry.start));
      // Mon-Fri only. Saturday/Sunday work is real but is not part of
      // the pay-period total this milestone celebrates.
      if (startISO < weekStart || startISO >= friExcl) continue;
      weeklyHours += hoursForEntry(entry);
    }

    // Iterate matching milestones — usually one, but the design is
    // 1-to-many in case Darrell collects two milestones in one shift.
    for (const m of matching) {
      if (weeklyHours < m.thresholdHours) continue;
      await fireMilestone(supabase, affectedWorkerId, weekStart, m);
    }
  } catch (err) {
    // Best-effort — never let a milestone error break the calling
    // route. The clock-in action MUST succeed regardless.
    console.error("[milestones] check failed", err);
  }
}

async function fireMilestone(
  supabase: SupabaseClient,
  workerId: string,
  weekStart: string,
  m: WeeklyMilestone,
): Promise<void> {
  // Atomic dedupe via INSERT: if a row already exists for
  // (worker_id, week_start, milestone_key), the unique-violation
  // (Postgres 23505) trips and we silently skip. No read-then-write
  // race window.
  const { error: insertErr } = await supabase
    .from("worker_milestone_fires")
    .insert({
      worker_id: workerId,
      week_start: weekStart,
      milestone_key: m.key,
    });

  if (insertErr) {
    // 23505 = unique violation = already fired this week, expected.
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") return;
    console.error("[milestones] insert failed", insertErr);
    return;
  }

  // Recipients: every active worker + admin. Thomas is an admin so
  // this naturally includes him.
  const { data: recipients } = await supabase
    .from("users")
    .select("id")
    .in("role", ["worker", "admin"])
    .eq("active", true);
  const userIds = (recipients ?? []).map((r) => r.id);
  if (userIds.length === 0) return;

  // OneSignal needs an absolute HTTPS URL for big_picture. NEXTAUTH_URL
  // is the canonical base set in Vercel for this deployment.
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  const imageUrl = base ? `${base}${m.imagePath}` : undefined;

  await sendPush(
    {
      user_ids: userIds,
      title: m.title,
      message: m.message,
      image_url: imageUrl,
    },
    supabase,
  );
}
