// DIY Hire availability engine — public surface.
//
// Import from "@/lib/hire" rather than reaching into the individual files,
// so the public page, the admin console and Doug's tools all demonstrably
// share one implementation of the rules.
//
//   Pure rules  → ./availability, ./charging   (no database, no clock)
//   Data access → ./repo                        (Supabase, service role)
//   Constants   → ./config                      (incl. UNCONFIRMED figures)
//
// NOTE — `./repo` is deliberately NOT re-exported here. It imports the
// Supabase client, and this barrel is imported by client components (the
// calendar evaluates the same pure rules in the browser). Re-exporting it
// would drag @supabase/supabase-js into the browser bundle for no reason.
// Server code imports it explicitly:
//
//   import { loadHireCatalogue } from "@/lib/hire/repo";

export * from "./types";
export * from "./dates";
export * from "./charging";
export * from "./availability";
export * from "./booking";
export {
  HIRE_PUBLIC_LAUNCH,
  HIRE_PHONE,
  HIRE_PHONE_TEL,
  HIRE_LOCATION,
  COUNTER_HOURS,
  CLOSED_DAY_INDICES,
  PENDING_HOLD_HOURS,
  AVAILABILITY_HORIZON_DAYS,
  BLOCK_REASONS,
  BONDS_CONFIRMED,
  UNCONFIRMED_RATE_SLUGS,
  CUTOUT_PHOTO_SLUGS,
  DELIVERY_FEE_CENTS,
  LATE_RETURN_CHARGE,
  HIRE_POLICY,
  TERMS_ACCORDION_ORDER,
  type BlockReason,
  type PolicyTopic,
  type PolicyEntry,
} from "./config";
