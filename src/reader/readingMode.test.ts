import { expect, test } from "bun:test";
import { globalReadingModeFallback, isPagedMode, isReversedMode, readingAxis, resolveReadingMode } from "./readingMode.ts";

test("prefers the series override over both the source hint and the global default", () => {
  expect(resolveReadingMode("LONG_STRIP_GAPS", "PAGED_LTR", "PAGED_VERTICAL")).toBe("LONG_STRIP_GAPS");
});

test("falls through to the source hint when the series override is DEFAULT", () => {
  expect(resolveReadingMode("DEFAULT", "LONG_STRIP", "PAGED_VERTICAL")).toBe("LONG_STRIP");
});

test("falls through to the global default when neither override nor hint applies", () => {
  expect(resolveReadingMode("DEFAULT", "DEFAULT", "PAGED_VERTICAL")).toBe("PAGED_VERTICAL");
  expect(resolveReadingMode(null, null, "LONG_STRIP")).toBe("LONG_STRIP");
});

test("falls back to right to left when every level is unset", () => {
  expect(resolveReadingMode(null, null, null)).toBe("PAGED_RTL");
  expect(resolveReadingMode("DEFAULT", "DEFAULT", "DEFAULT")).toBe("PAGED_RTL");
  expect(globalReadingModeFallback).toBe("PAGED_RTL");
});

test("treats a missing series override the same as DEFAULT", () => {
  expect(resolveReadingMode(undefined, "PAGED_LTR", "LONG_STRIP")).toBe("PAGED_LTR");
});

test("classifies the three paged modes and the two strip modes", () => {
  expect(isPagedMode("PAGED_RTL")).toBe(true);
  expect(isPagedMode("PAGED_LTR")).toBe(true);
  expect(isPagedMode("PAGED_VERTICAL")).toBe(true);
  expect(isPagedMode("LONG_STRIP")).toBe(false);
  expect(isPagedMode("LONG_STRIP_GAPS")).toBe(false);
});

test("reports a horizontal axis only for the two horizontal paged modes", () => {
  expect(readingAxis("PAGED_RTL")).toBe("horizontal");
  expect(readingAxis("PAGED_LTR")).toBe("horizontal");
  expect(readingAxis("PAGED_VERTICAL")).toBe("vertical");
  expect(readingAxis("LONG_STRIP")).toBe("vertical");
  expect(readingAxis("LONG_STRIP_GAPS")).toBe("vertical");
});

test("reverses the axis only for right to left", () => {
  expect(isReversedMode("PAGED_RTL")).toBe(true);
  expect(isReversedMode("PAGED_LTR")).toBe(false);
  expect(isReversedMode("LONG_STRIP")).toBe(false);
});
