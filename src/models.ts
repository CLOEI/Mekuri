export type PublicationStatus = "ongoing" | "completed" | "hiatus";

export interface Manga {
  id: string;
  /** Source identity used to reload live details and chapters from Library. */
  sourceId?: string;
  sourceMangaId?: string;
  title: string;
  coverAsset: string;
  sourceName: string;
  publicationStatus: PublicationStatus;
  totalChapterCount: number;
  unreadChapterCount: number;
  downloadedChapterCount: number;
  dateAdded: string;
  lastReadTimestamp: string | null;
}

export type LibraryFilter = "all" | "unread" | "completed";
export type LibrarySort = "title" | "added" | "read";
export type Destination = "library" | "browse";
