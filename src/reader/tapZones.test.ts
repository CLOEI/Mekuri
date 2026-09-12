import { expect, test } from "bun:test";
import { resolveTapAction } from "./tapZones.ts";
import type { TapZoneLayout } from "./readerSettings.ts";
import type { ResolvedReadingMode } from "./readingMode.ts";

/** Taps the centre of a 3x3 cell in a 300x300 frame. */
function tap(layout: TapZoneLayout, mode: ResolvedReadingMode, column: number, row: number) {
  return resolveTapAction(layout, mode, column * 100 + 50, row * 100 + 50, 300, 300);
}

test("L-shaped left to right goes back above and left of centre, forward below and right", () => {
  expect(tap("l-shaped", "PAGED_LTR", 0, 0)).toBe("previous");
  expect(tap("l-shaped", "PAGED_LTR", 1, 0)).toBe("previous");
  expect(tap("l-shaped", "PAGED_LTR", 2, 0)).toBe("previous");
  expect(tap("l-shaped", "PAGED_LTR", 0, 1)).toBe("previous");
  expect(tap("l-shaped", "PAGED_LTR", 1, 1)).toBe("menu");
  expect(tap("l-shaped", "PAGED_LTR", 2, 1)).toBe("next");
  expect(tap("l-shaped", "PAGED_LTR", 0, 2)).toBe("next");
  expect(tap("l-shaped", "PAGED_LTR", 2, 2)).toBe("next");
});

test("L-shaped right to left mirrors horizontally without flipping the bands", () => {
  expect(tap("l-shaped", "PAGED_RTL", 0, 0)).toBe("previous");
  expect(tap("l-shaped", "PAGED_RTL", 2, 0)).toBe("previous");
  expect(tap("l-shaped", "PAGED_RTL", 0, 1)).toBe("next");
  expect(tap("l-shaped", "PAGED_RTL", 1, 1)).toBe("menu");
  expect(tap("l-shaped", "PAGED_RTL", 2, 1)).toBe("previous");
  expect(tap("l-shaped", "PAGED_RTL", 0, 2)).toBe("next");
  expect(tap("l-shaped", "PAGED_RTL", 2, 2)).toBe("next");
});

test("the next zone is on the left in right to left and on the right in left to right", () => {
  expect(tap("edge", "PAGED_RTL", 0, 1)).toBe("next");
  expect(tap("edge", "PAGED_RTL", 2, 1)).toBe("previous");
  expect(tap("edge", "PAGED_LTR", 0, 1)).toBe("previous");
  expect(tap("edge", "PAGED_LTR", 2, 1)).toBe("next");
  expect(tap("edge", "PAGED_LTR", 1, 1)).toBe("menu");
});

test("the next zone is at the bottom in vertical and both strip modes", () => {
  for (const mode of ["PAGED_VERTICAL", "LONG_STRIP", "LONG_STRIP_GAPS"] as ResolvedReadingMode[]) {
    expect(tap("edge", mode, 1, 0)).toBe("previous");
    expect(tap("edge", mode, 1, 1)).toBe("menu");
    expect(tap("edge", mode, 1, 2)).toBe("next");
  }
});

test("L-shaped keeps the same screen layout in the vertical and strip modes", () => {
  for (const mode of ["PAGED_VERTICAL", "LONG_STRIP", "LONG_STRIP_GAPS"] as ResolvedReadingMode[]) {
    expect(tap("l-shaped", mode, 0, 0)).toBe("previous");
    expect(tap("l-shaped", mode, 2, 0)).toBe("previous");
    expect(tap("l-shaped", mode, 0, 1)).toBe("previous");
    expect(tap("l-shaped", mode, 1, 1)).toBe("menu");
    expect(tap("l-shaped", mode, 2, 1)).toBe("next");
    expect(tap("l-shaped", mode, 0, 2)).toBe("next");
    expect(tap("l-shaped", mode, 1, 2)).toBe("next");
    expect(tap("l-shaped", mode, 2, 2)).toBe("next");
  }
});

test("every layout advances downward in the vertical and strip modes", () => {
  for (const mode of ["PAGED_VERTICAL", "LONG_STRIP", "LONG_STRIP_GAPS"] as ResolvedReadingMode[]) {
    for (const layout of ["l-shaped", "kindle", "edge"] as TapZoneLayout[]) {
      expect(tap(layout, mode, 1, 2)).toBe("next");
    }
  }
});

test("Kindle-ish opens the menu along the leading band and pages from the others", () => {
  expect(tap("kindle", "PAGED_LTR", 0, 0)).toBe("menu");
  expect(tap("kindle", "PAGED_LTR", 1, 0)).toBe("menu");
  expect(tap("kindle", "PAGED_LTR", 2, 0)).toBe("menu");
  expect(tap("kindle", "PAGED_LTR", 0, 1)).toBe("previous");
  expect(tap("kindle", "PAGED_LTR", 1, 1)).toBe("next");
  expect(tap("kindle", "PAGED_LTR", 2, 2)).toBe("next");
  expect(tap("kindle", "PAGED_RTL", 0, 1)).toBe("next");
  expect(tap("kindle", "PAGED_RTL", 2, 1)).toBe("previous");
});

test("the disabled layout only ever opens the menu", () => {
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      expect(tap("disabled", "PAGED_RTL", column, row)).toBe("menu");
      expect(tap("disabled", "LONG_STRIP", column, row)).toBe("menu");
    }
  }
});

test("a zero sized frame falls back to the centre rather than paging", () => {
  expect(resolveTapAction("l-shaped", "PAGED_LTR", 0, 0, 0, 0)).toBe("menu");
});
