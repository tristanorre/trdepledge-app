// Weak-PIN denylist + validator.
//
// 4-digit PINs have a 10 000 keyspace. With a 5-fail/15-min lockout
// (lib/auth.ts) the online attacker gets ~480 guesses/day per worker.
// At that rate, the bottom couple of dozen "popular" PINs (1234, 0000,
// 1111, the year, …) account for a non-trivial fraction of real-world
// chosen PINs and therefore most of the practical risk. Banning them
// at the choose-a-PIN step costs nothing and removes the easy wins.
//
// Sourced from public studies of leaked PINs (Bonneau et al., DataGenetics
// "1,1234, 1111…" analysis). Not exhaustive — sequences and repeats are
// caught structurally below rather than enumerated.
const COMMON_PINS = new Set<string>([
  "0000", "1111", "2222", "3333", "4444",
  "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "1212", "2121", "1122",
  "1313", "2580", "0852", "1004", "2000",
  "2001", "2010", "2020", "2021", "2022", "2023", "2024", "2025", "2026",
  "1990", "1991", "1992", "1993", "1994", "1995", "1996", "1997", "1998", "1999",
  "1980", "1985", "1989", "0007", "1004", "1313",
]);

/**
 * Returns null if the PIN is acceptable, or a human-readable error
 * message otherwise. Format check (`^\d{4}$`) is the caller's job —
 * we assume `pin` is already 4 digits when we get here.
 */
export function rejectWeakPin(pin: string): string | null {
  if (COMMON_PINS.has(pin)) {
    return "That PIN is too common. Please pick a different one.";
  }
  // All-same digits already in COMMON_PINS but belt-and-braces:
  if (/^(\d)\1{3}$/.test(pin)) {
    return "PIN can't be the same digit repeated.";
  }
  // Strict ascending or descending sequences (1234, 9876) — catches
  // PINs that didn't make the static list.
  if (isSequential(pin, +1) || isSequential(pin, -1)) {
    return "PIN can't be a simple ascending or descending sequence.";
  }
  return null;
}

function isSequential(pin: string, step: 1 | -1): boolean {
  for (let i = 1; i < pin.length; i++) {
    const prev = pin.charCodeAt(i - 1);
    const cur  = pin.charCodeAt(i);
    if (cur - prev !== step) return false;
  }
  return true;
}
