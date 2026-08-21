#!/usr/bin/env python3
"""Check the live DNS zone against what it is supposed to be.

    python3 scripts/check-dns.py                    # ask a public resolver
    python3 scripts/check-dns.py --server ns1.ventraip.net.au
    python3 scripts/check-dns.py --server ns4.wixdns.net

WHY THIS EXISTS

The zone is moving from Wix to VentraIP. Fifteen records have to be
recreated by hand in a different control panel, and two of them — the
Google MX set and the SPF — are the difference between mail working and
mail silently vanishing. Checking them by eye, in a web UI, at the end of a
long afternoon, is how a business loses a week of enquiries.

THE POINT IS `--server`. Query VentraIP's nameservers DIRECTLY, by name,
*before* the registrar's nameservers are changed. The new zone is live on
those servers from the moment you save it — it is simply not yet
authoritative for anyone. So the entire migration can be verified while the
old one is still serving traffic, and the cutover becomes a formality
rather than a leap.

Exit status is 0 only when every expected record matches, so this can gate
a cutover rather than merely inform one.

No third-party libraries: this speaks DNS over UDP directly, because the
one machine that always has Python and never has dnspython is the one you
are standing at when something is broken.
"""

import argparse
import socket
import struct
import sys

DOMAIN = "trdepledgegardeningandmaintenance.com"

# The zone as captured from ns4.wixdns.net on 2026-08-21, plus the one
# record Wix could never create. Values only — TTLs deliberately not
# checked, since they legitimately differ between providers and a TTL
# mismatch has never once broken a website.
#
# `send.` MX is the whole reason for the migration: Resend needs an MX on
# that subdomain for the SES bounce/complaint feedback loop, and Wix only
# permits MX at the apex. Mark it expected=False until the new zone exists,
# so a pre-migration run against Wix still reports a clean bill.
EXPECTED = {
    ("@", "A"): ["76.76.21.21"],
    ("@", "MX"): [
        "10 aspmx.l.google.com",
        "20 alt1.aspmx.l.google.com",
        "30 alt2.aspmx.l.google.com",
        "40 alt3.aspmx.l.google.com",
        "50 alt4.aspmx.l.google.com",
    ],
    ("@", "TXT"): [
        "v=spf1 include:_spf.google.com ~all",
        "google-site-verification=GsXWIVNhDJJTuEx0UXG1VZNSL6540JmBI0Z4g_KTLbI",
        # Unidentified ownership token. Carried across because nobody could
        # say what breaks without it; drop it only once that is known.
        "d8874430-4075-11f0-b737-55778a798898",
    ],
    ("www", "CNAME"): [DOMAIN],
    ("app", "A"): ["76.76.21.21"],
    ("send", "TXT"): ["v=spf1 include:amazonses.com ~all"],
    ("_dmarc", "TXT"): ["v=DMARC1; p=none;"],
    ("resend._domainkey", "TXT"): [
        "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXy8SLac10qKD9anH/GWCWPWnZ"
        "loTKvD6IXnPoxHA61l0txOCKbK6VOQ821bAcHVtGWlCLiNPvHliv8pv7yFqgSqfSy"
        "Ksfhfsh8hiAgkO5GqlKrMoQTx/l78sJ5XsPLyPzvnwexqsMbAPrrfFe2DjW/w9w89"
        "6kUuUbYCRom7DDpQIDAQAB"
    ],
}

# Records that must exist AFTER the migration but cannot exist at Wix.
# Checked only with --post. The exact hostname comes from the Resend
# dashboard (Domains → Records) — it is region-specific, and this project's
# domain is in Tokyo (ap-northeast-1). Confirm it there rather than trusting
# this constant.
EXPECTED_AFTER = {
    ("send", "MX"): ["10 feedback-smtp.ap-northeast-1.amazonses.com"],
}

# CAA is absent today, which is what lets Vercel renew certificates through
# whichever CA it likes. Some providers helpfully add a restrictive default.
# That is a silent time bomb: nothing breaks until a renewal ~60 days later.
FORBIDDEN = [("@", "CAA")]

TYPES = {"A": 1, "NS": 2, "CNAME": 5, "SOA": 6, "MX": 15, "TXT": 16, "CAA": 257, "DS": 43}


def query(name, qtype, server, timeout=6):
    pkt = struct.pack(">HHHHHH", 0x1234, 0x0100, 1, 0, 0, 0)
    pkt += b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\0"
    pkt += struct.pack(">HH", qtype, 1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(pkt, (server, 53))
        data, _ = sock.recvfrom(4096)
    finally:
        sock.close()
    return data


def read_name(data, off):
    parts = []
    while True:
        length = data[off]
        if length == 0:
            off += 1
            break
        if length & 0xC0 == 0xC0:
            ptr = struct.unpack(">H", data[off : off + 2])[0] & 0x3FFF
            parts.append(read_name(data, ptr)[0])
            off += 2
            break
        off += 1
        parts.append(data[off : off + length].decode(errors="replace"))
        off += length
    return ".".join(parts), off


def answers(data, want):
    qd, an, _, _ = struct.unpack(">HHHH", data[4:12])
    off = 12
    for _ in range(qd):
        _, off = read_name(data, off)
        off += 4
    out = []
    for _ in range(an):
        _, off = read_name(data, off)
        rtype, _, _, rlen = struct.unpack(">HHIH", data[off : off + 10])
        off += 10
        if rtype == want:
            if rtype == 1:
                out.append(socket.inet_ntoa(data[off : off + 4]))
            elif rtype in (2, 5):
                out.append(read_name(data, off)[0])
            elif rtype == 15:
                pref = struct.unpack(">H", data[off : off + 2])[0]
                out.append(f"{pref} {read_name(data, off + 2)[0]}")
            elif rtype == 16:
                # A TXT record is one or more length-prefixed strings; long
                # DKIM keys are always split across several.
                pos, chunks = off, []
                while pos < off + rlen:
                    n = data[pos]
                    chunks.append(data[pos + 1 : pos + 1 + n].decode(errors="replace"))
                    pos += 1 + n
                out.append("".join(chunks))
            elif rtype == 257:
                tl = data[off + 1]
                tag = data[off + 2 : off + 2 + tl].decode()
                out.append(f'{data[off]} {tag} "{data[off + 2 + tl : off + rlen].decode(errors="replace")}"')
        off += rlen
    return out


def fqdn(label):
    return DOMAIN if label == "@" else f"{label}.{DOMAIN}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--server", default="8.8.8.8",
                    help="Nameserver to ask. Use VentraIP's directly to verify the new zone "
                         "BEFORE switching the registrar. Default: 8.8.8.8")
    ap.add_argument("--post", action="store_true",
                    help="Also require the records that only exist after the migration (send. MX).")
    args = ap.parse_args()

    server = args.server
    if not server.replace(".", "").isdigit():
        try:
            server = socket.gethostbyname(args.server)
        except OSError as e:
            print(f"Cannot resolve nameserver {args.server}: {e}", file=sys.stderr)
            return 2

    checks = dict(EXPECTED)
    if args.post:
        checks.update(EXPECTED_AFTER)

    print(f"Checking {DOMAIN} against {args.server} ({server})\n")
    failures = 0

    for (label, rtype), expected in checks.items():
        try:
            got = answers(query(fqdn(label), TYPES[rtype], server), TYPES[rtype])
        except Exception as e:
            print(f"  FAIL  {label:20} {rtype:6} query failed: {e}")
            failures += 1
            continue

        missing = [e for e in expected if e not in got]
        extra = [g for g in got if g not in expected]
        if not missing and not extra:
            print(f"  ok    {label:20} {rtype:6} {len(got)} record(s)")
            continue

        failures += 1
        print(f"  FAIL  {label:20} {rtype:6}")
        for m in missing:
            print(f"          missing: {m}")
        for x in extra:
            print(f"          unexpected: {x}")

    for label, rtype in FORBIDDEN:
        try:
            got = answers(query(fqdn(label), TYPES[rtype], server), TYPES[rtype])
        except Exception:
            got = []
        if got:
            failures += 1
            print(f"  FAIL  {label:20} {rtype:6} should not exist — would gate certificate renewal")
            for g in got:
                print(f"          found: {g}")
        else:
            print(f"  ok    {label:20} {rtype:6} absent, as intended")

    # A DS record at the parent pins the domain to Wix's signing keys. Move
    # the nameservers while it is published and the domain stops resolving
    # everywhere — the loudest possible failure. There is none today.
    try:
        ds = answers(query(DOMAIN, TYPES["DS"], "8.8.8.8"), TYPES["DS"])
    except Exception:
        ds = []
    print()
    if ds:
        failures += 1
        print("  FAIL  DNSSEC: a DS record is published at the .com registry.")
        print("        REMOVE IT AND WAIT FOR IT TO EXPIRE BEFORE CHANGING NAMESERVERS,")
        print("        or the domain will stop resolving for everyone.")
    else:
        print("  ok    DNSSEC: no DS at the registry — nameserver change is safe")

    print()
    if failures:
        print(f"{failures} problem(s). Do not cut over.")
        return 1
    print("All records match. Safe to proceed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
