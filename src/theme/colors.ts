/**
 * Runtime access to the design tokens declared in src/index.css (@theme).
 *
 * Recharts needs concrete color strings, so chart components read the CSS
 * custom properties Tailwind emits instead of hardcoding hex values. The
 * fallbacks below only exist for environments where the stylesheet hasn't
 * loaded (e.g. unit tests) and must mirror index.css.
 */

const FALLBACKS: Record<string, string> = {
  ink: "#0f172a",
  primary: "#0f766e",
  secondary: "#38bdf8",
  success: "#16a34a",
  danger: "#dc2626",
};

/** Neutral chart chrome (axis text, grid lines) — Tailwind slate values. */
const NEUTRALS = {
  axisText: "#64748b", // slate-500
  gridLine: "#e2e8f0", // slate-200
};

export function themeColor(name: keyof typeof FALLBACKS): string {
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-${name}`)
      .trim();
    if (v) return v;
  }
  return FALLBACKS[name];
}

export const chartChrome = NEUTRALS;
