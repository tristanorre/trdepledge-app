# DNS migration: Wix → VentraIP

Status: **prepared, awaiting approval.** Nothing below has been executed.

Zone captured from `ns4.wixdns.net` on 2026-08-21. Re-run
`python3 scripts/check-dns.py --server ns4.wixdns.net` before starting; if
it reports anything but a clean pass, the zone has changed since and this
document needs re-checking.

---

## What is actually moving

**Only the DNS zone.** This is worth being clear about, because "moving off
Wix hosting" sounds much bigger than it is:

| Thing | Where it lives | Changes? |
| --- | --- | --- |
| The website | Vercel | **No** |
| The app (`app.` subdomain) | Vercel, same deploy | **No** |
| Mailboxes | Google Workspace | **No** |
| Transactional email | Resend | **No** (starts working) |
| Database | Supabase | **No** |
| **The DNS zone** | **Wix → VentraIP** | **Yes** |

Wix hosts nothing for this business. It answers DNS queries and that is
all. No deploy is needed, no code changes, no downtime for the site if the
records are recreated correctly.

## Why we are doing it

Resend has been unable to verify the sending domain since 10 May — three
months of enquiry emails failing with HTTP 403. The cause is not a missed
step:

> **Wix doesn't support subdomains for MX records.** This means you can't
> verify your domain for Resend if your DNS is managed by Wix.
> — Resend dashboard, domain status *Pending*

Confirmed against the live zone: `send.` has the SPF TXT record but **no
MX**, while the apex has five MX records. Wix permits MX at the apex only.
Resend needs an MX on `send.` for the SES bounce and complaint feedback
loop, so verification can never complete while Wix holds the zone.

Everything else on this list is a consequence: the site's contact form,
Doug's captured leads, and review requests all send through Resend.

---

## Pre-flight facts

Established by querying the authoritative nameservers directly. These are
the things that decide whether a nameserver change is safe.

**DNSSEC — safe.** The zone is signed at Wix (three `DNSKEY` records), but
there is **no `DS` record at the `.com` registry**, so the chain of trust is
inactive and nothing validates those signatures. Moving nameservers is
therefore safe.

> This is the one that takes a domain completely offline. If a `DS` record
> ever appears, it must be removed and allowed to expire *before* the
> nameservers change — otherwise every validating resolver on the internet
> refuses to answer for the domain. `check-dns.py` tests for this on every
> run. Do not enable DNSSEC at VentraIP during the migration.

**No CAA records.** Any certificate authority may issue for this domain,
which is what lets Vercel renew its certificates unattended. If VentraIP
adds a restrictive CAA by default, **remove it** — or nothing breaks until a
renewal roughly sixty days later, long after anyone connects the two events.
`check-dns.py` fails if a CAA appears.

**No other subdomains.** Probed for `mail`, `ftp`, `cpanel`, `webmail`,
`autodiscover`, `blog`, `shop`, `m`, `staging`, `dev`, `hire`, `admin`,
`portal` — none exist. The fifteen records below are the whole zone.

**Registrar unknown.** Nameservers at Wix usually means the domain was
registered there, but that is an inference. Check the Wix account: if the
domain is registered elsewhere, the nameserver change happens at that
registrar instead, and a transfer to VentraIP is a separate decision that
does not need to happen at the same time. **Do not attempt a registrar
transfer and a nameserver change together** — if something breaks you will
not know which one did it.

---

## The zone to recreate

Fifteen records. Everything here exists today and must exist afterwards,
byte for byte.

```zone
; ---- website (Vercel) ----
@                    600   IN  A      76.76.21.21
www                  600   IN  CNAME  trdepledgegardeningandmaintenance.com.
app                 3600   IN  A      76.76.21.21

; ---- mailboxes (Google Workspace) — GET THESE EXACTLY RIGHT ----
@                   3600   IN  MX     10 aspmx.l.google.com.
@                   3600   IN  MX     20 alt1.aspmx.l.google.com.
@                   3600   IN  MX     30 alt2.aspmx.l.google.com.
@                   3600   IN  MX     40 alt3.aspmx.l.google.com.
@                   3600   IN  MX     50 alt4.aspmx.l.google.com.
@                    600   IN  TXT    "v=spf1 include:_spf.google.com ~all"
_dmarc              3600   IN  TXT    "v=DMARC1; p=none;"

; ---- verification tokens ----
@                    600   IN  TXT    "google-site-verification=GsXWIVNhDJJTuEx0UXG1VZNSL6540JmBI0Z4g_KTLbI"
@                    600   IN  TXT    "d8874430-4075-11f0-b737-55778a798898"

; ---- transactional email (Resend) ----
send                3600   IN  TXT    "v=spf1 include:amazonses.com ~all"
resend._domainkey   3600   IN  TXT    "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXy8SLac10qKD9anH/GWCWPWnZloTKvD6IXnPoxHA61l0txOCKbK6VOQ821bAcHVtGWlCLiNPvHliv8pv7yFqgSqfSyKsfhfsh8hiAgkO5GqlKrMoQTx/l78sJ5XsPLyPzvnwexqsMbAPrrfFe2DjW/w9w896kUuUbYCRom7DDpQIDAQAB"
```

Notes on individual records:

- **The DKIM key is one long value.** DNS transports it as several chunks,
  and some control panels show it split or truncate it on paste. Paste it as
  a single unbroken string and verify with the checker, not by eye.
- **`d8874430-4075-11f0-…`** is an unidentified ownership token. Carry it
  across. It is most likely Wix's own domain-verification record and may
  become removable after the move — but nobody has confirmed what reads it,
  so removing it is a separate, later, deliberate change.
- **`app` is an A record** where Vercel documents a `CNAME` to
  `cname.vercel-dns.com`. It works, and this is **not** the time to change
  it. Change one thing at a time; revisit after the dust settles.
- **TTLs need not match.** They are listed for fidelity, but a TTL mismatch
  has never broken a website. The checker ignores them deliberately.

### The one new record

```zone
send                3600   IN  MX     10 feedback-smtp.ap-northeast-1.amazonses.com.
```

This is the entire point of the migration. **Copy the exact value from the
Resend dashboard** (Domains → the domain → Records) rather than trusting the
line above — it is region-specific, and this domain is in Tokyo
(`ap-northeast-1`) per the dashboard.

---

## Runbook

### Phase 1 — lower TTLs at Wix (do this ~24 hours before)

In the Wix DNS editor, drop every record's TTL to **300 seconds**. This
shortens the window in which resolvers hold stale answers, so a rollback
takes minutes rather than hours. Wix may not permit this on every record
type; do what it allows and note what it doesn't.

Then wait for the *old* TTLs to expire — the MX records are 3600, so a full
hour after the change before proceeding.

### Phase 2 — build the complete zone at VentraIP

Create all fifteen records above, **plus the `send.` MX**, in VentraIP's DNS
editor. Do **not** change the nameservers yet.

This is the part that makes the migration safe: the new zone is live on
VentraIP's servers the moment it is saved, it is simply not yet
authoritative for anyone. Nothing is at risk while you build it.

### Phase 3 — verify VentraIP's copy *before* cutting over

Ask VentraIP's nameservers directly. Get the hostnames from your VentraIP
account (they look like `ns1.ventraip.net.au`).

```bash
python3 scripts/check-dns.py --server ns1.ventraip.net.au --post
```

Repeat for the second nameserver — both must serve the same zone.

**Do not proceed until this prints `All records match. Safe to proceed.`**
Exit status is 0 only on a clean pass, so it can gate the decision rather
than merely inform it. This step removes essentially all the risk: by the
time the nameservers change, the answer is already known to be correct.

### Phase 4 — change the nameservers

At the registrar (Wix, most likely — see *Registrar unknown* above), replace:

```
ns4.wixdns.net
ns5.wixdns.net
```

with VentraIP's pair.

`.com` delegation is cached for up to 48 hours, so for a period **both**
Wix and VentraIP may be answering different resolvers. This is fine and
expected *because both zones are correct* — that is what Phase 2 bought.
**Leave the Wix zone in place and unmodified** throughout. Do not delete it,
do not cancel anything at Wix, until Phase 6.

### Phase 5 — verify the public view

```bash
python3 scripts/check-dns.py --post                    # public resolver
python3 scripts/check-dns.py --server 1.1.1.1 --post   # a second opinion
```

Then check the things DNS exists to serve:

- `https://trdepledgegardeningandmaintenance.com` loads
- `https://www.…` loads
- `https://app.…/login` loads
- **Send an email to a real mailbox on the domain and confirm it arrives.**
  Nothing else proves mail survived.
- Resend dashboard → the domain flips from *Pending* to *Verified*
- `/admin/health` → re-run the probes; the Resend check should clear

### Phase 6 — after 48 hours, once everything is confirmed

- Raise TTLs back to sensible values (3600 for most, 600 for the A records)
- Only now, retire the zone at Wix
- Re-run `check-dns.py --post` once more

---

## Rollback

Any time before Phase 6, rollback is: **change the nameservers back to
`ns4.wixdns.net` / `ns5.wixdns.net`.** The Wix zone is still there and still
correct, which is exactly why Phase 4 says not to touch it. Recovery is
bounded by the delegation TTL rather than by anyone's ability to remember
fifteen records under pressure.

If mail is affected, that is the emergency: Google MX records are the only
part of this where a mistake loses data rather than causing an outage. Roll
back first, diagnose afterwards.

## What this does not cover

- **Registrar transfer.** Moving the *registration* to VentraIP is a
  separate job with its own risks (auth codes, 60-day transfer locks). Not
  required for any of the above. Do it later, if at all.
- **Email deliverability improvements.** DMARC is `p=none`, i.e. monitoring
  only. Worth moving to `p=quarantine` once Resend is verified and you have
  watched the reports for a couple of weeks — but not during a migration.
- **Anything at Wix that is not DNS.** If the Wix account holds a site
  builder, a mailbox, or a subscription, check what cancelling it would take
  down before cancelling anything.
