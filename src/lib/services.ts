// Shared between the contact form (client) and the contact page server
// component, so the page can validate `?service=…` URL params against
// the same option list the dropdown uses. Lives outside `components/`
// (where ContactForm sits behind `"use client"`) — exporting a helper
// from a client module turns it into a client reference proxy that
// can't be called during SSR.

export const SERVICE_OPTIONS = [
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
