/**
 * Strip geometry, kept free of the DOM so the page derivation the webtoon
 * viewer depends on can be tested directly.
 */
export interface StripItem {
  key: string;
  chapterId: string;
  /** Page index inside its own chapter. */
  index: number;
  /** Distance from the top of the strip. */
  offset: number;
  size: number;
}

export interface StripEntry {
  key: string;
  chapterId: string;
  index: number;
  /** Height predicted from the size the source reports, used until the page is measured. */
  estimate?: number;
}

/**
 * Stacks measured sizes into offsets. Pages differ in size, so an unmeasured
 * entry uses its own estimate and only falls back to the shared one when the
 * source reported no dimensions.
 */
export function buildStripItems(entries: StripEntry[], sizes: Map<string, number>, estimate: number, gap: number): StripItem[] {
  let offset = 0;
  return entries.map((entry, position) => {
    const size = sizes.get(entry.key) ?? entry.estimate ?? estimate;
    const item: StripItem = { key: entry.key, chapterId: entry.chapterId, index: entry.index, offset, size };
    offset += size + (position < entries.length - 1 ? gap : 0);
    return item;
  });
}

/**
 * The strip has no page index of its own, so the current page is whichever item
 * covers the centre of the viewport. Scrolling past either end clamps to the
 * nearest item rather than reporting nothing.
 */
export function currentStripItem(items: StripItem[], scrollTop: number, viewportHeight: number): StripItem | null {
  if (!items.length) return null;
  const centre = scrollTop + viewportHeight / 2;
  let candidate = items[0];
  for (const item of items) {
    if (centre < item.offset) break;
    candidate = item;
    if (centre < item.offset + item.size) break;
  }
  return candidate;
}

export function stripItemFor(items: StripItem[], chapterId: string, index: number) {
  return items.find((item) => item.chapterId === chapterId && item.index === index) ?? null;
}
