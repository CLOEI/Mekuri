export type PublicationStatus = "ongoing" | "completed" | "hiatus";

export interface Manga {
  id: string;
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
export type Destination = "library" | "updates" | "history" | "browse" | "more";
