# Notification hero images

Images attached to push notifications via OneSignal's `big_picture`
(Android), `chrome_web_image` (web push), and `ios_attachments` (iOS).
Files in this folder are served at `/notifications/<filename>` and
referenced by absolute URL (NEXTAUTH_URL + path) when the push is sent.

## Files

- **`super-darrell-15h.png`** — "Super Darrell — 15 Hours Worked"
  weekly celebration. Fires once per Mon–Fri week when Darrell Wood
  crosses 15 net hours. See `src/lib/milestones.ts` for the trigger.

## Image specs

- **Format**: PNG (best quality + transparency) or JPG.
- **Size**: ideally 1080×1920 portrait or 1456×1080 landscape. Most
  platforms crop/letterbox to their own aspect, so center the subject
  away from the edges.
- **Weight**: keep under 1 MB — OneSignal pulls the image server-side
  before delivery, and a slow pull delays the notification.
- **HTTPS**: served from the production domain (Vercel takes care of
  TLS automatically). Localhost / IP URLs won't work in production.

## Adding a new milestone

1. Drop the new image here.
2. Add an entry to `WEEKLY_MILESTONES` in `src/lib/milestones.ts`
   with a fresh `key` and `imagePath` pointing at the file.
3. Deploy. The check runs on every clock action + admin time edit.
