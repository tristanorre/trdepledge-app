// Shared between the contact form (client) and the contact page server
// component, so the page can validate `?service=…` URL params against
// the same option list the dropdown uses. Lives outside `components/`
// (where ContactForm sits behind `"use client"`) — exporting a helper
// from a client module turns it into a client reference proxy that
// can't be called during SSR.

export const SERVICE_OPTIONS = [
  // "Lawn Mowing & Edging" is first because it is the single most common
  // job and the top item in the canonical SERVICES list. It was missing
  // here, so the footer's "Lawn mowing & edging" link fell back to
  // ?service=Garden%20Maintenance and the enquiry arrived under the wrong
  // heading — Thomas could not tell a mow request from a full maintenance
  // visit without reading the message.
  "Lawn Mowing & Edging",
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

export type ServiceOption = (typeof SERVICE_OPTIONS)[number];

export function isServiceOption(v: string): v is ServiceOption {
  return (SERVICE_OPTIONS as readonly string[]).includes(v);
}
