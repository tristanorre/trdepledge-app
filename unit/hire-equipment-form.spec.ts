import { expect, test } from "@playwright/test";

import {
  MAX_SPECS,
  parseMoneyToCents,
  slugify,
  validateEquipment,
  type EquipmentInput,
} from "@/lib/hire/equipment-form";

const VALID: EquipmentInput = {
  name: "Cement Mixer",
  category: "Concrete",
  blurb: "Tilting drum for concrete, mortar and render.",
  specs: ["Large drum", "Strong motor"],
  dailyRate: "50",
  bond: "100",
  isPublished: true,
  changeoverDays: 0,
};

test.describe("money entered by a person", () => {
  test("accepts the ways a rate gets typed", () => {
    expect(parseMoneyToCents("80")).toBe(8000);
    expect(parseMoneyToCents("$80")).toBe(8000);
    expect(parseMoneyToCents(" 79.50 ")).toBe(7950);
    expect(parseMoneyToCents("79.5")).toBe(7950);
    expect(parseMoneyToCents("1,250")).toBe(125000);
    expect(parseMoneyToCents("0")).toBe(0);
  });

  test("rejects what isn't a non-negative amount", () => {
    for (const bad of ["", "  ", "eighty", "-10", "8o", "1.234", "$", "1.2.3"]) {
      expect(parseMoneyToCents(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(parseMoneyToCents(null)).toBeNull();
    expect(parseMoneyToCents(undefined)).toBeNull();
  });

  test("lands on whole cents rather than drifting", () => {
    // The classic float trap: 79.99 * 100 is 7998.999… in binary.
    expect(parseMoneyToCents("79.99")).toBe(7999);
    expect(Number.isInteger(parseMoneyToCents("79.99")!)).toBe(true);
  });
});

test.describe("slugs", () => {
  test("are derived from the name, lowercased and hyphenated", () => {
    expect(slugify("Cement Mixer")).toBe("cement-mixer");
    expect(slugify("60L Steel Lawn Roller")).toBe("60l-steel-lawn-roller");
    expect(slugify("Post Hole Digger")).toBe("post-hole-digger");
  });

  test("drop punctuation and collapse whitespace", () => {
    expect(slugify("  Wacker  Packer! (6.5hp) ")).toBe("wacker-packer-65hp");
    expect(slugify("Mixer — Large")).toBe("mixer-large");
  });

  test("survive a name that slugifies to nothing", () => {
    // The route rejects this rather than inserting a blank slug.
    expect(slugify("!!!")).toBe("");
  });
});

test.describe("validation", () => {
  test("accepts a complete item", () => {
    const res = validateEquipment(VALID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.dailyRateCents).toBe(5000);
    expect(res.value.bondCents).toBe(10000);
    expect(res.value.specs).toEqual(["Large drum", "Strong motor"]);
  });

  test("lists every problem at once, as a next step", () => {
    const res = validateEquipment({ isPublished: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.problems).toEqual(["name", "category", "dailyRate", "bond"]);
    expect(res.message).toBe(
      "Nearly there — give it a name, pick a category, set a daily rate, set a bond.",
    );
  });

  test("a free tool is allowed, a nonsense rate is not", () => {
    expect(validateEquipment({ ...VALID, dailyRate: "0", bond: "0" }).ok).toBe(true);
    expect(validateEquipment({ ...VALID, dailyRate: "free" }).ok).toBe(false);
    expect(validateEquipment({ ...VALID, bond: "-50" }).ok).toBe(false);
  });

  test("changeover days must be a whole non-negative number", () => {
    expect(validateEquipment({ ...VALID, changeoverDays: 1 }).ok).toBe(true);
    expect(validateEquipment({ ...VALID, changeoverDays: -1 }).ok).toBe(false);
    expect(validateEquipment({ ...VALID, changeoverDays: 1.5 }).ok).toBe(false);
  });

  test("blank spec lines are dropped and the list is capped", () => {
    const res = validateEquipment({
      ...VALID,
      specs: ["one", "  ", "", "two", "three", "four", "five", "six", "seven"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.specs).toHaveLength(MAX_SPECS);
    expect(res.value.specs).not.toContain("");
  });

  test("empty optional text becomes null, not an empty string", () => {
    const res = validateEquipment({ ...VALID, blurb: "   ", photoPath: "" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.blurb).toBeNull();
    expect(res.value.photoPath).toBeNull();
  });

  test("publishing defaults to on but false is honoured", () => {
    expect(validateEquipment({ ...VALID, isPublished: false }).ok).toBe(true);
    const off = validateEquipment({ ...VALID, isPublished: false });
    if (off.ok) expect(off.value.isPublished).toBe(false);

    const unset = validateEquipment({ ...VALID, isPublished: undefined });
    if (unset.ok) expect(unset.value.isPublished).toBe(true);
  });

  test("over-long fields are truncated rather than rejected", () => {
    const res = validateEquipment({ ...VALID, name: "x".repeat(400) });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.name).toHaveLength(120);
  });
});
