import type { PageReference } from "../extensionApi";
import type { ResolvedReadingMode } from "./readingMode";
import type { PageFit, TapZoneLayout } from "./readerSettings";

/** A chapter handed to a viewer with its page list already resolved. */
export interface ViewerChapter {
  id: string;
  title: string;
  pages: PageReference[];
}

export type ChapterDirection = "previous" | "next";

export type TapAction = ChapterDirection | "menu";

/**
 * The imperative surface both viewers expose to the reader controller. Keeping
 * it identical is what lets the controller swap implementations without caring
 * which one is mounted.
 */
export interface ReaderViewerHandle {
  setChapters: (previous: ViewerChapter | null, current: ViewerChapter, next: ViewerChapter | null) => void;
  moveToPage: (index: number) => void;
  currentPage: () => number;
  handleTap: (x: number, y: number) => void;
  handleKey: (key: string) => boolean;
  destroy: () => void;
}

export interface ReaderViewerProps {
  sourceId: string;
  previousChapter: ViewerChapter | null;
  chapter: ViewerChapter;
  nextChapter: ViewerChapter | null;
  mode: ResolvedReadingMode;
  tapZones: TapZoneLayout;
  pageFit: PageFit;
  initialPage: number;
  onPageChanged: (chapterId: string, index: number, pageCount: number) => void;
  onRequestChapter: (direction: ChapterDirection) => void;
  onMenu: () => void;
}
