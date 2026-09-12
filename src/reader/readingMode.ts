/** Reading modes offered by the reader, mirroring the set Mihon exposes. */
export type ReadingMode = "DEFAULT" | "PAGED_RTL" | "PAGED_LTR" | "PAGED_VERTICAL" | "LONG_STRIP" | "LONG_STRIP_GAPS";

/** A mode a viewer can actually render. `DEFAULT` always resolves into one of these. */
export type ResolvedReadingMode = Exclude<ReadingMode, "DEFAULT">;

export const globalReadingModeFallback: ResolvedReadingMode = "PAGED_RTL";

export const readingModes: ReadingMode[] = ["DEFAULT", "PAGED_RTL", "PAGED_LTR", "PAGED_VERTICAL", "LONG_STRIP", "LONG_STRIP_GAPS"];

export const readingModeLabels: Record<ReadingMode, string> = {
  DEFAULT: "Default",
  PAGED_RTL: "Right to left",
  PAGED_LTR: "Left to right",
  PAGED_VERTICAL: "Vertical",
  LONG_STRIP: "Long strip",
  LONG_STRIP_GAPS: "Long strip with gaps",
};

export const readingModeDescriptions: Record<ReadingMode, string> = {
  DEFAULT: "Follow the global reading mode",
  PAGED_RTL: "One page at a time, next page on the left",
  PAGED_LTR: "One page at a time, next page on the right",
  PAGED_VERTICAL: "One page at a time, next page below",
  LONG_STRIP: "Continuous scrolling, no gaps",
  LONG_STRIP_GAPS: "Continuous scrolling with a gap between pages",
};

export function isReadingMode(value: unknown): value is ReadingMode {
  return typeof value === "string" && (readingModes as string[]).includes(value);
}

/**
 * Resolution order is series override, then source hint, then global default.
 * A `DEFAULT` or missing value at any level falls through to the next one.
 */
export function resolveReadingMode(override: ReadingMode | null | undefined, sourceHint: ReadingMode | null | undefined, global: ReadingMode | null | undefined): ResolvedReadingMode {
  if (override && override !== "DEFAULT") return override;
  if (sourceHint && sourceHint !== "DEFAULT") return sourceHint;
  if (global && global !== "DEFAULT") return global;
  return globalReadingModeFallback;
}

export function isPagedMode(mode: ResolvedReadingMode) {
  return mode === "PAGED_RTL" || mode === "PAGED_LTR" || mode === "PAGED_VERTICAL";
}

/** The axis a tap or key press advances along. Strip modes are always vertical. */
export function readingAxis(mode: ResolvedReadingMode): "horizontal" | "vertical" {
  return mode === "PAGED_RTL" || mode === "PAGED_LTR" ? "horizontal" : "vertical";
}

/** True when the next page sits before the current one along the axis. */
export function isReversedMode(mode: ResolvedReadingMode) {
  return mode === "PAGED_RTL";
}

export function hasStripGaps(mode: ResolvedReadingMode) {
  return mode === "LONG_STRIP_GAPS";
}
