// SMS templates straight from the spec. Keep wording in sync with the
// brand voice — Thomas reviewed these. Each takes a context and returns
// the rendered message string.
//
// AUTO triggers (used inside enquiry/booking/reminder flows):
//   enquiryReceived, bookingConfirmed, jobReminder
//
// MANUAL templates (presented as one-tap buttons on /admin/jobs/[id]):
//   onOurWay, jobComplete, quoteFollowUp, ndisAgreement
//
// `custom` is the free-text path — the admin types the message.

export type ManualTemplateKey = "onOurWay" | "jobComplete" | "quoteFollowUp" | "ndisAgreement" | "custom";

const SIGNOFF = "T.R. Depledge 0474 844 204";

export const sms = {
  // ── AUTO ─────────────────────────────────────
  enquiryReceived(firstName: string): string {
    return [
      `Hi ${firstName}, thanks for contacting T.R. Depledge Gardening & Maintenance!`,
      `We've received your enquiry and Thomas will call you back shortly.`,
      `Questions? Call 0474 844 204.`,
      `— T.R. Depledge Team`,
    ].join(" ");
  },
  bookingConfirmed(firstName: string): string {
    return [
      `Hi ${firstName}, your booking with T.R. Depledge Gardening & Maintenance is confirmed!`,
      `We'll be in touch to confirm your exact time.`,
      `Questions? Call Thomas on 0474 844 204.`,
      `— T.R. Depledge Team`,
    ].join(" ");
  },
  jobReminder(firstName: string): string {
    return [
      `Hi ${firstName}, just a reminder that the T.R. Depledge team is scheduled to visit you tomorrow.`,
      `Any questions, call Thomas on 0474 844 204.`,
      `See you then! — T.R. Depledge Team`,
    ].join(" ");
  },

  // ── MANUAL ───────────────────────────────────
  onOurWay(firstName: string): string {
    return `Hi ${firstName}, the T.R. Depledge team is on their way and will arrive shortly. — ${SIGNOFF}`;
  },
  jobComplete(firstName: string): string {
    return [
      `Hi ${firstName}, we've finished up at your property today.`,
      `Hope you're happy with the result! Call if you need anything.`,
      `— Thomas, ${SIGNOFF}`,
    ].join(" ");
  },
  quoteFollowUp(firstName: string): string {
    return [
      `Hi ${firstName}, just following up on the quote we provided.`,
      `Happy to answer any questions — give me a call.`,
      `— Thomas 0474 844 204`,
    ].join(" ");
  },
  ndisAgreement(firstName: string): string {
    return [
      `Hi ${firstName}, we've emailed your NDIS service agreement for review.`,
      `Please check your inbox.`,
      `— ${SIGNOFF}`,
    ].join(" ");
  },
};

export const MANUAL_TEMPLATES: Array<{
  key: Exclude<ManualTemplateKey, "custom">;
  label: string;
  description: string;
}> = [
  { key: "onOurWay",      label: "On our way",       description: "Letting the client know the team is on the way." },
  { key: "jobComplete",   label: "Job complete",     description: "Wrap-up message after finishing a job." },
  { key: "quoteFollowUp", label: "Quote follow-up",  description: "Gentle nudge after sending a quote." },
  { key: "ndisAgreement", label: "NDIS agreement",   description: "Letting an NDIS client know to check their email." },
];
