// DIY Hire availability engine — public surface.
//
// Import from "@/lib/hire" rather than reaching into the individual files,
// so the public page, the admin console and Doug's tools all demonstrably
// share one implementation of the rules.
//
//   Pure rules  → ./availability, ./charging   (no database, no clock)
//   Data access → ./repo                        (Supabase, service role)
//   Constants   → ./config                      (incl. UNCONFIRMED figures)

export * from "./types";
export * from "./dates";
export * from "./charging";
export * from "./availability";
export * from "./repo";
export {
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
  DELIVERY_FEE_CENTS,
  LATE_RETURN_CHARGE,
  HIRE_POLICY,
  TERMS_ACCORDION_ORDER,
  type BlockReason,
  type PolicyTopic,
  type PolicyEntry,
} from "./config";
