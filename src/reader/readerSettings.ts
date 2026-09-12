import { isReadingMode, type ReadingMode } from "./readingMode";

export type TapZoneLayout = "l-shaped" | "kindle" | "edge" | "disabled";

/** How a page is fitted when its size does not match the frame. */
export type PageFit = "screen" | "width" | "height" | "original";

export const pageFits: PageFit[] = ["screen", "width", "height", "original"];

export const pageFitLabels: Record<PageFit, string> = {
  screen: "Fit screen",
  width: "Fit width",
  height: "Fit height",
  original: "Original size",
};

export const tapZoneLayouts: TapZoneLayout[] = ["l-shaped", "kindle", "edge", "disabled"];

export const tapZoneLabels: Record<TapZoneLayout, string> = {
  "l-shaped": "L-shaped",
  kindle: "Kindle-ish",
  edge: "Edge",
  disabled: "Disabled",
};

export interface ReaderSettings {
  /** Global default, used when a series has no override and the source gives no hint. */
  readingMode: ReadingMode;
  tapZones: TapZoneLayout;
  pageFit: PageFit;
  volumeKeys: boolean;
  showModeOnOpen: boolean;
}

export const defaultReaderSettings: ReaderSettings = {
  readingMode: "PAGED_RTL",
  tapZones: "l-shaped",
  pageFit: "screen",
  volumeKeys: true,
  showModeOnOpen: true,
};

const READER_STORAGE_KEY = "mekuri.reader.v1";

function isTapZoneLayout(value: unknown): value is TapZoneLayout {
  return typeof value === "string" && (tapZoneLayouts as string[]).includes(value);
}

function isPageFit(value: unknown): value is PageFit {
  return typeof value === "string" && (pageFits as string[]).includes(value);
}

export function loadReaderSettings(): ReaderSettings {
  try {
    const stored = window.localStorage.getItem(READER_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    if (typeof parsed !== "object" || parsed === null) return defaultReaderSettings;
    const value = parsed as Partial<Record<keyof ReaderSettings, unknown>>;
    return {
      readingMode: isReadingMode(value.readingMode) ? value.readingMode : defaultReaderSettings.readingMode,
      tapZones: isTapZoneLayout(value.tapZones) ? value.tapZones : defaultReaderSettings.tapZones,
      pageFit: isPageFit(value.pageFit) ? value.pageFit : defaultReaderSettings.pageFit,
      volumeKeys: typeof value.volumeKeys === "boolean" ? value.volumeKeys : defaultReaderSettings.volumeKeys,
      showModeOnOpen: typeof value.showModeOnOpen === "boolean" ? value.showModeOnOpen : defaultReaderSettings.showModeOnOpen,
    };
  } catch {
    return defaultReaderSettings;
  }
}

export function saveReaderSettings(settings: ReaderSettings) {
  try { window.localStorage.setItem(READER_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage may be unavailable in a restricted webview. */ }
}
