# T.R. Depledge App — User Manual

A practical guide to the field-service-management app. Two audiences: **Thomas** (admin) and **field workers**. Skip to whichever applies to you.

> **App URL:** https://trdepledgegardeningandmaintenance.com/login
> **Last updated:** 10 May 2026

---

## Quick start (everyone, 5 minutes)

1. **Open the URL above on your phone** (not laptop, your phone).
2. **Log in:**
   - **Thomas:** *Admin* tab → email `t.rdepledge@outlook.com` → password
   - **Workers:** *Worker* tab → tap your name in the list → enter your 4-digit PIN
3. **Allow notifications** when the browser asks. This is how you'll know about new jobs / enquiries / schedule changes.
4. **Add to home screen** so it works like a real app (no browser bar, opens with one tap):
   - **iPhone (Safari):** tap the **share icon** at the bottom → **Add to Home Screen**
   - **Android (Chrome):** tap the **⋮ menu** → **Install app**
5. **Change your credential** off the seed default:
   - Admin: top-right avatar → **Account** → change password
   - Worker: bottom-nav **Account** → change PIN

That's it for setup. Everything below is reference.

---

# Part 1 — Admin guide (for Thomas)

The admin side is at **`/admin`** after login. All sections are accessible from the left sidebar.

## 1.1 — When a customer fills in the website form

A new enquiry triggers four things automatically:

1. The enquiry lands in **/admin/enquiries** with status `new`.
2. The customer gets an **SMS** auto-reply within 60 seconds (if Twilio is configured and they gave a phone number).
3. **You get a push notification** on your phone with the customer name, service, and suburb. Tap it to open the enquiry directly.
4. **You get an email** with all the enquiry details (if Resend is configured).

### Converting an enquiry to a job

1. Open `/admin/enquiries` → click the row.
2. Read the message and decide whether to take the job.
3. Click **"Convert to Client + Job"**.
4. The system creates a new client record and a draft job pre-filled with their suburb, service type, and contact info.
5. From there you can assign workers, set the date/time, and tweak details.

If it's not a real lead (spam, wrong area, etc.), click **"Mark as ignored"** instead — keeps a record without polluting your client list.

## 1.2 — Creating and managing jobs

### New job from scratch
1. **/admin/jobs** → **"+ New Job"**
2. Fill in: client, address/suburb, date, scheduled time, description, client type (Private / NDIS / Aged Care)
3. **Assign workers** by ticking the boxes — each ticked worker gets a push notification: *"New job assigned for [date]"*
4. Click **Save**

### Editing a job
- Click any job in `/admin/jobs` → **Edit job** button.
- You can change date, time, description, workers, status, and the client type.
- **Removing a worker** also removes them from the job's clock-log (their time log entry stays for history but they won't see the job anymore).

### Job statuses
- **Scheduled** — booked, work hasn't started
- **In progress** — at least one worker has clocked in
- **Completed** — every assigned worker has clocked out (auto-set, see §1.4)
- **Cancelled** — job called off, no charge
- **Pending review** — manual hold (rarely used)

## 1.3 — During and after a job

### Photos (before/after)
On the job detail page (`/admin/jobs/[id]`), there are two sections: **Photos — Before** and **Photos — After**. Workers add these from their app; you can also add or delete photos here as admin. Photos are stored privately in Supabase Storage with 1-hour signed URLs (so links you copy expire — generate fresh ones if sharing externally).

### Materials (line items)
- Click **"+ Add line"** in the Materials section.
- Pick a material from the catalogue (Lawn Turf, Mulch, Fertiliser, etc.) — these were seeded by migration 0009.
- Set quantity. Markup % defaults to 0 but can be set per-line.
- Total line cost = `qty × base_price × (1 + markup/100)`.

To edit the catalogue itself, change the prices via Supabase SQL Editor (no UI for this yet).

### Cost breakdown
The cost is calculated automatically from:
1. **First-hour minimum** — every started worker bills a full hour at the configured hourly rate, even if they only stayed 5 minutes.
2. **Overtime** — after the first hour, time bills in 15-minute blocks rounded UP, at `rate ÷ 4` per block.
3. **Waiting time** — minutes you record in the "Waiting time" field on the job get added to each clocked-in worker's billable minutes (so it counts toward both the first-hour minimum and overtime blocks).
4. **Materials** — sum of all line items.

**Worked example:** 2 workers, 1 hour 7 minutes on site each, 15 minutes waiting time. Private rate $60/hr.
- Each worker's billable time: 67 min + 15 min = 82 min
- First hour: 2 × $60 = $120
- Overtime: each worker has 82 − 60 = 22 min over → ceil(22/15) = 2 blocks → 2 × 2 = 4 blocks total → 4 × $15 = $60
- **Total labour: $180**

The breakdown card on the job page shows this split.

## 1.4 — Fixing forgotten clock-outs

Workers occasionally forget to clock out. The job will sit in `In progress` forever and the cost ticks up. Use the **Time log** card on `/admin/jobs/[id]` to fix it.

### Quick fix — "Set end to now"
If a worker is still clocked in but the job is actually finished, click **"Set end to now"** on their row. Their `end` time is set to right now and the job auto-completes (assuming all other workers are also clocked out).

### Editing exact times
1. Click **Edit** on the worker's row.
2. Two date-time inputs appear (start / end).
3. Set the correct values.
4. Click **Save**.

The cost breakdown re-calculates immediately.

### Re-opening a closed worker
If you save an `end` time on a previously-closed worker as `null` (use Edit → clear the End field → Save, or **Clear** button to remove the entry entirely), the job rolls back from `Completed` to `In progress`. Useful if you accidentally closed someone too early.

### Removing an entry entirely
**Clear** removes a worker's clock-log from the job — they'll need to clock back in to be billed. Asks for confirmation since it's destructive.

## 1.5 — Sending invoices via Xero

Once a job is `Completed` and Xero is connected (see §1.9), the **Send to Xero** card appears on the job page.

1. Click **Send invoice to Xero**.
2. The system creates a draft invoice in Xero with:
   - **Labour line:** Quantity = total billed hours (rounded-up per worker), UnitAmount = the configured hourly rate, ItemCode = NDIS support item if it's an NDIS job (`01_019_0120_1_1`)
   - **Material lines:** one per line item with markup applied
3. The job page shows the Xero invoice ID. The invoice is in **Draft** status in Xero — open Xero to review and finalise/email.

If something looks wrong, edit the time log or materials, then click Send again — it'll create a new draft invoice (the old one stays in Xero for you to delete manually).

## 1.6 — Clients

`/admin/clients` lists every client you've created. Click any client to:
- See their job history
- Edit their contact info
- Add notes ("Anything Thomas needs to remember about this client")
- Mark them as NDIS / Aged Care / Private

Clients are typically created via enquiry conversion (§1.1). To add one manually: **`/admin/clients/new`**.

## 1.7 — HR (workers, roster, leave, payroll)

### Workers
`/admin/hr` lists all worker accounts. Click a worker to:
- Edit name, phone, email, colour (used in schedule view), employment start date
- Mark police-check complete with a date
- Set them inactive (hides them from job assignment dropdowns)
- Reset their PIN

**To add a new worker:** click **+ New Worker** on `/admin/hr`. They appear in the login dropdown immediately.

### Roster
`/admin/hr/roster` — weekly grid showing who's working when. Click a cell to assign / unassign shifts.

### Leave
`/admin/hr/leave` — pending leave requests appear at the top. Approve or deny; the worker gets a push notification with your decision and their leave balance updates. Approved leave shows on the schedule view.

### Payroll
`/admin/hr/payroll` — at end of pay period, click **Export CSV** to download a payroll-formatted file. Fields per row: worker name, hours worked (sum of billable hours from completed jobs), waiting time, leave taken. Import into Xero Payroll or whatever you use.

## 1.8 — Inventory

`/admin/inventory` — every asset (vehicle, mower, tool kit, etc.) seeded in migration 0009 plus anything you've added.

- Click an asset to see its history
- **Assign** a piece of kit to a worker (e.g. PPE kit → Bradley)
- Mark it as **Needs Service** with notes
- **Audit log** at the bottom shows every change to that asset, ever — this log is **immutable** (the database physically blocks deletes), so it's a real record.

Use case: if a mower goes missing, the audit log shows who last had it.

## 1.9 — Settings & integrations

`/admin/settings` shows the status of every third-party integration. Each row is one of Twilio (SMS), OneSignal (push), Email (Resend), Xero (invoicing).

- **Active** (green pill) = env vars are set in Vercel and the integration is working.
- **Not configured** (yellow pill) = env vars missing — the integration becomes a no-op (logs a warning, doesn't crash).

For Xero specifically, **Active** means env vars are set; you also need to click **Connect Xero** to do the OAuth handshake. Once connected, the Send to Xero buttons start working.

## 1.10 — Account

Top-right avatar → **Account** to change your password. Use a strong password — anyone with admin access can see all client and financial data.

---

# Part 2 — Worker guide (for field staff)

The worker app is at **`/worker`** after login. Designed for phones — should be added to your home screen so it opens like an app.

## 2.1 — Login

1. App URL: https://trdepledgegardeningandmaintenance.com/login
2. Tap **Worker** tab
3. Find your name in the list, tap it
4. Enter your 4-digit PIN (the seed default is `1234` — change it on first login)

If your name isn't in the list, tell Thomas — he needs to add your account first.

## 2.2 — Today's jobs

When you open the app, you land on `/worker` showing **Today's jobs**. Each card shows:
- Client name + job description
- Address + suburb (tap to open in Maps)
- Scheduled time
- Other workers assigned

Tap a card to open the full job page.

## 2.3 — On the job

### Clock in
On the job detail page, the **big yellow button at the top** says **Clock in**. Tap it when you arrive on site. The button changes to **Clock out** and shows a running timer.

If you're the first worker to clock in, the job status flips from `Scheduled` to `In progress`.

### Photos
- **Before:** take photos of the area before you start. Tap **"+ Add Before Photo"** → camera opens → take pic → upload. Aim for 2–4 photos per job.
- **After:** take photos when you're done. Tap **"+ Add After Photo"** → same flow.

Photos sync to Thomas's admin app immediately. Your phone needs internet to upload — if you're offline, the photo queues and uploads when you're back on signal.

### Notes
Tap **"+ Add Note"** to leave a text note. Use this for things like:
- "Client wasn't home, gate was open as agreed"
- "Found broken sprinkler at front bed, need to come back with a new one"
- "Skip the rear lawn next time, owner is reseeding"

Notes appear on the admin's job page so Thomas knows what happened.

### Waiting time
If you arrive and the client isn't ready (gate locked, paying customer running late, weather delay), record the minutes in the **Waiting time** field. **You still get billed for waiting time** — it adds to your on-site hours for the labour calculation. Be honest about what was actual waiting vs. just travel time.

### Clock out
When you're done, tap **Clock out**. Your end time is recorded. If you're the last worker on the job to clock out, the job auto-flips to **Completed**.

> ⚠️ **Forgot to clock out?** Tell Thomas — he can fix the time on the admin side. Don't leave it unclocked-out for days, the cost calculation will be wrong.

## 2.4 — Schedule

`/worker/schedule` — your personal day view, showing today and the next 6 days. Each card is a job assigned to you. Tap to open.

Updates in real time — if Thomas adds you to a job, it appears here within a few seconds.

## 2.5 — Leave

`/worker/leave` — your annual / sick / personal leave balances + pending and approved leave history.

### Requesting leave
1. Tap **+ Request Leave**
2. Pick start and end dates
3. Pick category (Annual / Sick / Personal / Unpaid)
4. Add a reason if you want
5. Submit

Thomas gets a push notification. When he approves or denies it, you get a push notification with the decision. Approved leave shows on the schedule.

## 2.6 — Account

Bottom-nav → **Account**:
- Change your PIN (do this on first login)
- See your profile (name, email, phone — tell Thomas if anything's wrong)
- Sign out

---

# Part 3 — Common scenarios

## "A new enquiry just landed"
1. You see a push notification *"New website enquiry — [Name] · [Service] · [Suburb]"*.
2. Tap the notification → opens the enquiry in `/admin/enquiries/[id]`.
3. Read the message, decide whether to take it.
4. Click **Convert to Client + Job** (or **Mark as ignored** if it's spam).
5. On the new job, set the date/time and assign workers.
6. Workers get pushed *"New job assigned for [date]"*.

## "A worker forgot to clock out yesterday"
1. Open `/admin/jobs` → find the job → click in.
2. Scroll to the **Time log** card.
3. The worker's row shows `Still clocked in` (amber pill).
4. Click **Set end to now** if they JUST left, or **Edit** to set a specific time.
5. Save. The job auto-completes (if all workers are now closed) and the cost recalculates.

## "I want to send an invoice for a completed job"
1. Open the completed job at `/admin/jobs/[id]`.
2. Verify the **Cost breakdown** is right (labour, waiting, materials).
3. If anything's wrong, fix it (edit time log, edit materials), then re-check.
4. Scroll to **Send to Xero** card → click **Send invoice to Xero**.
5. Open Xero in another tab, find the draft invoice, review, send to client.

## "A client wants the job rescheduled"
1. `/admin/jobs/[id]` → **Edit job**.
2. Change the date / scheduled time.
3. Save. The assigned workers get a push notification *"Schedule changed for [client]"*.

## "A worker is leaving / on extended leave"
- **One-off leave:** they request via `/worker/leave`, you approve.
- **Permanent departure:** edit their account in `/admin/hr` → set them inactive. They can no longer log in and are hidden from new-job assignment dropdowns. Their historical data stays.

## "I want to look up a client's job history"
- `/admin/clients` → click the client → scroll to **Job History**. Every job you've ever done for them, with dates, status, and total billed.

---

# Part 4 — Troubleshooting

| Problem | Likely cause / fix |
|---|---|
| **I can't log in** | Check you're on the right tab (Admin vs Worker). Workers select name from list — if your name isn't there, you don't have an account yet. Caps lock on for the password? |
| **Push notifications not working** | (a) Did you click "Allow" when the browser asked? Re-allow in browser settings. (b) Is OneSignal configured in Vercel env? Check `/admin/settings` — should say "Active" for OneSignal. |
| **SMS auto-reply not firing** | Check `/admin/settings` — Twilio should say "Active". If "Not configured", env vars need setting in Vercel. The customer must have given a phone number in the form (it's optional). |
| **A job's cost looks wrong** | Most common cause: a worker forgot to clock out or has the wrong end-time. Check the Time log card on the job. |
| **The "Send to Xero" button is missing** | (a) Job must be `Completed`. (b) Xero must be both **configured** (env vars in Vercel) AND **connected** (OAuth done from `/admin/settings`). |
| **Photos won't upload** | Worker's phone is offline or has no signal. Photos queue and upload when back online. If still broken after that, check Supabase Storage's `job-photos` bucket isn't full / disabled. |
| **A worker can see jobs that aren't theirs** | They shouldn't — every worker query filters by `assigned_worker_ids`. If this is happening, it's a bug — tell the dev. |
| **Worker's PWA install isn't sticking** | iOS Safari only allows install via the share button → Add to Home Screen. If they used Chrome on iOS, the install won't work — tell them to use Safari. |
| **The site/app is slow** | Static marketing pages should be instant. The admin/worker app is server-rendered per request — slower DB or a region away from Sydney can cause delays. Usually 1-2s is normal. |

---

# Part 5 — Reference

## Hourly rates by client type
- **Private:** $60.00 / hour ($15.00 per 15-min block)
- **NDIS:** $56.98 / hour ($14.245 per 15-min block, exact across a full hour)
- **Aged Care:** $56.98 / hour (same rate as NDIS)

These are stored in the `config` table; they can be edited via Supabase SQL Editor:
```sql
update public.config set value = '6500' where key = 'private_rate_cents';
```
Values are **integer cents**, never decimals.

## Billing rules (one-line summary)

> *Any part of the first hour bills as a full hour, per started worker. After the first hour, time bills in 15-minute blocks rounded UP at rate÷4 per block. Waiting time recorded on the job adds to each clocked-in worker's billable minutes before the rounding rules apply.*

## Job-status flow

```
new (enquiry)
    │ Convert to client + job
    ▼
scheduled
    │ first worker clocks in
    ▼
in_progress
    │ last worker clocks out
    ▼
completed
    │ Send to Xero (optional)
    ▼
invoiced
```

Plus two off-flow statuses: **cancelled** (no charge) and **pending_review** (manual hold).

## Push notification triggers

| Event | Recipient |
|---|---|
| New website enquiry | All admins |
| Job assigned | The newly-assigned worker(s) |
| Job schedule changed | All workers on the job |
| Leave request submitted | All admins |
| Leave decision | The worker who requested |
| Daily job reminder (08:30 UTC) | Workers with jobs the next day |

## Keyboard shortcuts (admin desktop)

None defined. (TODO if Thomas wants any.)

## Where to get help

- **Code / dev questions:** see [`CLAUDE.md`](../CLAUDE.md) at the repo root
- **README:** [`README.md`](../README.md) for deployment, env vars, migrations
- **Audit report:** if [`audit-report.md`](../audit-report.md) exists at the root, that's the most recent code review

---

*End of manual. Update the "Last updated" date at the top whenever you change content here.*
