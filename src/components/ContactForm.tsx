"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

const SERVICE_OPTIONS = [
  "Garden Maintenance",
  "Instant Lawn Install",
  "Yard Revamp",
  "Landscaping",
  "Hedge & Tree Trimming",
  "Garden Clean-Up",
  "NDIS Garden Support",
  "Aged Care Services",
  "Gift Card Enquiry",
  "Other / Not Sure",
] as const;

type ServiceOption = (typeof SERVICE_OPTIONS)[number];

function isServiceOption(v: string): v is ServiceOption {
  return (SERVICE_OPTIONS as readonly string[]).includes(v);
}

const CLIENT_TYPES = [
  "Private Client",
  "NDIS Participant",
  "Aged Care / Home Care Package",
  "Business / Commercial",
] as const;

type Status = "idle" | "submitting" | "success" | "error";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // Pre-select the Service Type dropdown when the user lands here from a
  // service card (e.g. /contact?service=Hedge%20%26%20Tree%20Trimming).
  // Falls back to empty so the placeholder option stays selected.
  const searchParams = useSearchParams();
  const serviceParam = searchParams?.get("service") ?? "";
  const initialService = isServiceOption(serviceParam) ? serviceParam : "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      first_name: String(fd.get("first_name") ?? "").trim(),
      last_name:  String(fd.get("last_name")  ?? "").trim(),
      email:      String(fd.get("email")      ?? "").trim(),
      phone:      String(fd.get("phone")      ?? "").trim(),
      suburb:     String(fd.get("suburb")     ?? "").trim(),
      service_type: String(fd.get("service_type") ?? ""),
      client_type:  String(fd.get("client_type")  ?? ""),
      message:    String(fd.get("message") ?? "").trim(),
      // Honeypot — kept blank by real browsers (it's invisible to users
      // and labelled `tabIndex={-1}` so keyboard users skip it). Bots
      // that auto-fill every input will populate it and get rejected
      // server-side.
      website:    String(fd.get("website") ?? ""),
    };

    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <div className="form-success" role="status">
        ✅ Message sent! Thomas will be in touch shortly.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {/*
        Honeypot. Visually hidden + aria-hidden + tabIndex=-1 so screen
        readers and keyboard navigation skip it; bots that auto-fill every
        text input will populate it and the server will silently drop the
        submission. Note: do NOT use `display:none` — some smarter bots
        skip those. Off-screen positioning fools a wider net.
      */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
      >
        <label htmlFor="website">Website (leave blank)</label>
        <input
          type="text"
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="first_name">First Name *</label>
          <input id="first_name" name="first_name" className="form-input" type="text" placeholder="John" required autoComplete="given-name" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="last_name">Last Name *</label>
          <input id="last_name" name="last_name" className="form-input" type="text" placeholder="Smith" required autoComplete="family-name" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="email">Email Address *</label>
        <input id="email" name="email" className="form-input" type="email" placeholder="john@example.com" required autoComplete="email" />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="phone">Phone Number</label>
        <input id="phone" name="phone" className="form-input" type="tel" placeholder="04XX XXX XXX" autoComplete="tel" inputMode="tel" />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="suburb">Suburb / Area *</label>
        <input id="suburb" name="suburb" className="form-input" type="text" placeholder="e.g. Wallaroo, Kadina, Moonta" required autoComplete="address-level2" />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="service_type">Service Type *</label>
        <select id="service_type" name="service_type" className="form-select" required defaultValue={initialService}>
          <option value="" disabled>Select a service…</option>
          {SERVICE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="client_type">Client Type</label>
        <select id="client_type" name="client_type" className="form-select" defaultValue={CLIENT_TYPES[0]}>
          {CLIENT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="message">Tell Us About Your Job</label>
        <textarea id="message" name="message" className="form-textarea" placeholder="Describe what you need done, the size of your property, and any other relevant details…" />
      </div>

      <button type="submit" className="form-submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send Message →"}
      </button>

      {status === "error" && error && (
        <div className="form-error" role="alert">⚠ {error}</div>
      )}
    </form>
  );
}
