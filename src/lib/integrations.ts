// Single source of truth for "is integration X configured?"
//
// Each integration degrades gracefully — its sender helper checks
// `<name>Configured()` and no-ops if false (logging once at WARN level).
// The Settings page also reads these to drive its status badges.

export type IntegrationKey = "twilio" | "onesignal" | "xero" | "square" | "email";

export type IntegrationStatus = {
  key: IntegrationKey;
  configured: boolean;
  missing: string[];
};

export function twilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN  &&
    process.env.TWILIO_FROM_NUMBER
  );
}

export function onesignalConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID &&
    process.env.ONESIGNAL_REST_API_KEY
  );
}

export function xeroConfigured(): boolean {
  return !!(
    process.env.XERO_CLIENT_ID &&
    process.env.XERO_CLIENT_SECRET &&
    process.env.XERO_REDIRECT_URI
  );
}

export function squareConfigured(): boolean {
  return !!(
    process.env.SQUARE_ACCESS_TOKEN &&
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  );
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  const has = (name: string) => !!process.env[name];
  const status = (key: IntegrationKey, vars: string[]): IntegrationStatus => ({
    key,
    configured: vars.every(has),
    missing: vars.filter((v) => !has(v)),
  });
  return [
    status("twilio",    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]),
    status("onesignal", ["NEXT_PUBLIC_ONESIGNAL_APP_ID", "ONESIGNAL_REST_API_KEY"]),
    status("xero",      ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"]),
    status("square",    ["SQUARE_ACCESS_TOKEN", "SQUARE_WEBHOOK_SIGNATURE_KEY"]),
    status("email",     ["RESEND_API_KEY", "RESEND_FROM", "ENQUIRY_NOTIFY_EMAIL"]),
  ];
}
