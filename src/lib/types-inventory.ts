// Inventory-specific types. Kept in their own file so /lib/types.ts
// stays focused on the most-used cross-cutting types.

export const ASSET_CATEGORIES = [
  "Vehicles",
  "Power Equipment",
  "Hand Tools",
  "Safety & PPE",
  "Materials Stock",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_CONDITIONS = [
  "Good",
  "Needs Service",
  "Damaged",
  "In Stock",
  "Out of Stock",
] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export type Asset = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  identifier: string | null;
  category: AssetCategory;
  icon: string | null;
  condition: AssetCondition;
  assigned_to: string | null;
  notes: string | null;
};

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  action: string;
  item_id: string | null;
  item_name: string;
  from_worker_id: string | null;
  to_worker_id: string | null;
  performed_by: string | null;
  note: string | null;
};
