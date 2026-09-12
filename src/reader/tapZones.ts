import { isReversedMode, readingAxis, type ResolvedReadingMode } from "./readingMode";
import type { TapZoneLayout } from "./readerSettings";
import type { TapAction } from "./viewer";

/*
 * Tap zones are described on a 3x3 grid in screen space, so every layout keeps
 * its forward region at the bottom for the vertical and strip modes. Right to
 * left mirrors the grid horizontally rather than swapping every region.
 */

function third(value: number, size: number) {
  if (size <= 0) return 1;
  const fraction = value / size;
  if (fraction < 1 / 3) return 0;
  if (fraction < 2 / 3) return 1;
  return 2;
}

function regionFor(layout: TapZoneLayout, column: number, row: number, horizontal: boolean): TapAction {
  if (layout === "disabled") return "menu";
  if (layout === "edge") {
    // The one layout defined along the reading axis instead of the screen.
    const band = horizontal ? column : row;
    if (band === 0) return "previous";
    if (band === 2) return "next";
    return "menu";
  }
  if (layout === "kindle") {
    if (row === 0) return "menu";
    return column === 0 ? "previous" : "next";
  }
  // L-shaped: the top band and the leading middle cell go back, and the
  // remaining cells form an L that advances.
  if (column === 1 && row === 1) return "menu";
  if (row === 0 || (column === 0 && row === 1)) return "previous";
  return "next";
}

export function resolveTapAction(layout: TapZoneLayout, mode: ResolvedReadingMode, x: number, y: number, width: number, height: number): TapAction {
  const rawColumn = third(x, width);
  const column = isReversedMode(mode) ? 2 - rawColumn : rawColumn;
  return regionFor(layout, column, third(y, height), readingAxis(mode) === "horizontal");
}
