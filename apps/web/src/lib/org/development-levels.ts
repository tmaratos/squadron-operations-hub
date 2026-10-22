/** CAPWATCH's canonical senior-member professional development codes. */
export const LEVELS = ["LV1", "LV2", "LV3", "LV4", "LV5"] as const;
export type Level = (typeof LEVELS)[number];

const LEGACY_LEVELS: Record<string, Level> = {
  I: "LV1", II: "LV2", III: "LV3", IV: "LV4", V: "LV5"
};

/** Older manual records used roman numerals. Preserve readability without rewriting D1. */
export function canonicalDevelopmentLevel(value: string | null | undefined): string | null {
  if (!value) return null;
  return LEGACY_LEVELS[value] ?? value;
}
