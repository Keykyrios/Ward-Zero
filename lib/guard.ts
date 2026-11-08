import type { Brief } from "./brief";

/** The language model may reword facts, never add to them. Every number it writes must already be in the facts it was given. */
export function briefIsGrounded(b: Brief, facts: unknown): boolean {
  const allowed = new Set((JSON.stringify(facts).match(/\d+(\.\d+)?/g) ?? []).map(Number));
  [24, 48, 1, 2, 3].forEach((n) => allowed.add(n)); // "24 hours", "48 hours", "NEWS2" digit, small counts
  const text = [b.family, ...Object.values(b.sbar)].join(" ");
  const nums = (text.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (nums.some((n) => !allowed.has(n))) return false;
  // No dosing or treatment language, ever.
  if (/\b(mg|mcg|ml|tablet|dose|dosage|prescri\w+|antibiotic\w*|inhaler|take \w+ (pill|tablet))\b/i.test(text)) return false;
  return b.family.length > 0 && Object.values(b.sbar).every((v) => typeof v === "string" && v.length > 0);
}
