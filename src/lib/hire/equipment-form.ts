// Validation for the add/edit equipment form.
//
// Pure, and imported by both the form and the API route — same reasoning as
// booking.ts: the browser's pass is for speed, the server's is the real one,
// and sharing the module stops them disagreeing.
//
// Money arrives from the form as a dollars string ("80", "79.50") because
// that's what Thomas types. It's converted to integer cents here, once, at
// the edge — everything downstream is exact integer arithmetic, and repo.ts
// converts back to numeric(10,2) on write.

export type EquipmentInput = {
  name: string;
  category: string;
  blurb?: string;
  specs?: string[];
  dailyRate: string;
  bond: string;
  photoPath?: string;
  flyerPath?: string;
  isPublished: boolean;
  sortOrder?: number;
  changeoverDays?: number;
};

export const EQUIPMENT_MAX_LENGTH = {
  name: 120,
  category: 60,
  blurb: 600,
  spec: 160,
  path: 300,
} as const;

/** Most specs bullets on a card; more than this stops being scannable. */
export const MAX_SPECS = 6;

export type EquipmentProblem =
  | "name"
  | "category"
  | "dailyRate"
  | "bond"
  | "changeoverDays";

const PHRASES: Record<EquipmentProblem, string> = {
  name: "give it a name",
  category: "pick a category",
  dailyRate: "set a daily rate",
  bond: "set a bond",
  changeoverDays: "use a whole number of changeover days",
};

export type CleanEquipment = {
  name: string;
  category: string;
  blurb: string | null;
  specs: string[];
  dailyRateCents: number;
  bondCents: number;
  photoPath: string | null;
  flyerPath: string | null;
  isPublished: boolean;
  sortOrder: number;
  changeoverDays: number;
};

export type EquipmentValidation =
  | { ok: true; value: CleanEquipment }
  | { ok: false; problems: EquipmentProblem[]; message: string };

const trim = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Parse a money field typed by a person into integer cents.
 *
 * Accepts "80", "$80", "79.50", " 79.5 ". Returns null for anything that
 * isn't a non-negative amount — including "eighty" and "-10". Rounds rather
 * than truncates so "79.505" can't quietly lose a cent.
 */
export function parseMoneyToCents(raw: unknown): number | null {
  const cleaned = String(raw ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "" || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Slug from a name: "60L Steel Lawn Roller" → "60l-steel-lawn-roller". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function validateEquipment(input: Partial<EquipmentInput>): EquipmentValidation {
  const name = trim(input.name, EQUIPMENT_MAX_LENGTH.name);
  const category = trim(input.category, EQUIPMENT_MAX_LENGTH.category);
  const blurb = trim(input.blurb, EQUIPMENT_MAX_LENGTH.blurb);
  const photoPath = trim(input.photoPath, EQUIPMENT_MAX_LENGTH.path);
  const flyerPath = trim(input.flyerPath, EQUIPMENT_MAX_LENGTH.path);

  const dailyRateCents = parseMoneyToCents(input.dailyRate);
  const bondCents = parseMoneyToCents(input.bond);

  const changeoverRaw = input.changeoverDays ?? 0;
  const changeoverDays = Number(changeoverRaw);

  const problems: EquipmentProblem[] = [];
  if (!name) problems.push("name");
  if (!category) problems.push("category");
  if (dailyRateCents === null) problems.push("dailyRate");
  if (bondCents === null) problems.push("bond");
  if (!Number.isInteger(changeoverDays) || changeoverDays < 0) problems.push("changeoverDays");

  if (problems.length > 0) {
    return {
      ok: false,
      problems,
      message: `Nearly there — ${problems.map((p) => PHRASES[p]).join(", ")}.`,
    };
  }

  const specs = (input.specs ?? [])
    .map((sp) => trim(sp, EQUIPMENT_MAX_LENGTH.spec))
    .filter(Boolean)
    .slice(0, MAX_SPECS);

  return {
    ok: true,
    value: {
      name,
      category,
      blurb: blurb || null,
      specs,
      dailyRateCents: dailyRateCents!,
      bondCents: bondCents!,
      photoPath: photoPath || null,
      flyerPath: flyerPath || null,
      isPublished: input.isPublished !== false,
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
      changeoverDays,
    },
  };
}
