import { expect, test } from "bun:test";
import { buildStripItems, currentStripItem, stripItemFor, type StripEntry } from "./webtoonPosition.ts";

function entries(chapterId: string, count: number, from = 0): StripEntry[] {
  return Array.from({ length: count }, (_, offset) => ({ key: `${chapterId}:${from + offset}`, chapterId, index: from + offset }));
}

function sizes(values: Record<string, number>) { return new Map(Object.entries(values)); }

test("stacks measured sizes into offsets and applies the gap between items only", () => {
  const items = buildStripItems(entries("c1", 3), sizes({ "c1:0": 100, "c1:1": 200, "c1:2": 50 }), 800, 8);
  expect(items.map((item) => item.offset)).toEqual([0, 108, 316]);
  expect(items.map((item) => item.size)).toEqual([100, 200, 50]);
});

test("uses the shared estimate for items that have not been measured yet", () => {
  const items = buildStripItems(entries("c1", 3), sizes({ "c1:1": 100 }), 500, 0);
  expect(items.map((item) => item.offset)).toEqual([0, 500, 600]);
});

test("prefers each entry's own estimate so differently sized pages reserve the right space", () => {
  const sized = entries("c1", 3).map((entry, index) => ({ ...entry, estimate: [200, 900, 400][index] }));
  const items = buildStripItems(sized, new Map(), 500, 0);
  expect(items.map((item) => item.offset)).toEqual([0, 200, 1100]);
  expect(items.map((item) => item.size)).toEqual([200, 900, 400]);
});

test("a measured size always wins over the entry estimate", () => {
  const sized = entries("c1", 2).map((entry) => ({ ...entry, estimate: 900 }));
  const items = buildStripItems(sized, sizes({ "c1:0": 150 }), 500, 0);
  expect(items.map((item) => item.size)).toEqual([150, 900]);
});

test("derives the current page from the item covering the viewport centre", () => {
  const items = buildStripItems(entries("c1", 4), sizes({ "c1:0": 400, "c1:1": 400, "c1:2": 400, "c1:3": 400 }), 400, 0);
  expect(currentStripItem(items, 0, 400)?.index).toBe(0);
  expect(currentStripItem(items, 300, 400)?.index).toBe(1);
  expect(currentStripItem(items, 700, 400)?.index).toBe(2);
});

test("reports the item whose top edge the centre lands on exactly", () => {
  const items = buildStripItems(entries("c1", 2), sizes({ "c1:0": 400, "c1:1": 400 }), 400, 0);
  expect(currentStripItem(items, 200, 400)?.index).toBe(1);
});

test("clamps to the last item when the centre is past the end of the strip", () => {
  const items = buildStripItems(entries("c1", 3), sizes({ "c1:0": 100, "c1:1": 100, "c1:2": 100 }), 100, 0);
  expect(currentStripItem(items, 5000, 400)?.index).toBe(2);
});

test("clamps to the first item when the centre is above the strip", () => {
  const items = buildStripItems(entries("c1", 2), sizes({ "c1:0": 100, "c1:1": 100 }), 100, 0);
  expect(currentStripItem(items, -500, 100)?.index).toBe(0);
});

test("returns null for an empty strip", () => {
  expect(currentStripItem([], 0, 800)).toBeNull();
});

test("reports the chapter the centred item belongs to so progress crosses chapters", () => {
  const items = buildStripItems([...entries("c1", 2), ...entries("c2", 2)], sizes({ "c1:0": 400, "c1:1": 400, "c2:0": 400, "c2:1": 400 }), 400, 0);
  const centred = currentStripItem(items, 900, 400);
  expect(centred?.chapterId).toBe("c2");
  expect(centred?.index).toBe(0);
});

test("locates an item by chapter and page index for scroll targeting", () => {
  const items = buildStripItems([...entries("c1", 2), ...entries("c2", 2)], sizes({ "c1:0": 100, "c1:1": 100, "c2:0": 100, "c2:1": 100 }), 100, 10);
  expect(stripItemFor(items, "c2", 1)?.offset).toBe(330);
  expect(stripItemFor(items, "c3", 0)).toBeNull();
});
