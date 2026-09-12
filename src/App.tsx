import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { AppShell } from "./components/AppShell";
import { LibraryScreen } from "./components/LibraryScreen";
import { MangaDetailsScreen } from "./components/MangaDetailsScreen";
import { BrowseScreen, MangaSourceDetails } from "./components/BrowseScreen";
import type { Destination, LibraryFilter, LibrarySort, Manga } from "./models";
import { theme } from "./theme";
import "./App.css";

const LIBRARY_STORAGE_KEY = "mekuri.library.v1";

function loadLibrary(): Manga[] {
  try {
    const stored = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is Manga => typeof value === "object" && value !== null && typeof value.id === "string" && typeof value.title === "string" && typeof value.coverAsset === "string" && typeof value.sourceName === "string" && (value.publicationStatus === "ongoing" || value.publicationStatus === "completed" || value.publicationStatus === "hiatus") && typeof value.totalChapterCount === "number" && typeof value.unreadChapterCount === "number" && typeof value.downloadedChapterCount === "number" && typeof value.dateAdded === "string" && (typeof value.lastReadTimestamp === "string" || value.lastReadTimestamp === null));
  } catch {
    return [];
  }
}

function sourceReference(manga: Manga) {
  if (manga.sourceId && manga.sourceMangaId) return { sourceId: manga.sourceId, mangaId: manga.sourceMangaId };
  const separator = manga.id.indexOf(":");
  if (separator <= 0 || separator === manga.id.length - 1) return null;
  return { sourceId: manga.id.slice(0, separator), mangaId: manga.id.slice(separator + 1) };
}

function App() {
  const [activeDestination, setActiveDestination] = useState<Destination>("library");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("title");
  const [libraryManga, setLibraryManga] = useState<Manga[]>(loadLibrary);
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [browseDetailsOpen, setBrowseDetailsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollPositions = useRef<Partial<Record<Destination, number>>>({});

  const visibleManga = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = libraryManga.filter((manga) => {
      const matchesQuery = !normalizedQuery || manga.title.toLocaleLowerCase().includes(normalizedQuery);
      const matchesFilter = filter === "all" || (filter === "unread" && manga.unreadChapterCount > 0) || (filter === "completed" && manga.publicationStatus === "completed");
      return matchesQuery && matchesFilter;
    });

    return [...filtered].sort((left, right) => {
      if (sort === "title") return left.title.localeCompare(right.title);
      if (sort === "added") return right.dateAdded.localeCompare(left.dateAdded) || left.title.localeCompare(right.title);
      if (!left.lastReadTimestamp && !right.lastReadTimestamp) return left.title.localeCompare(right.title);
      if (!left.lastReadTimestamp) return 1;
      if (!right.lastReadTimestamp) return -1;
      return right.lastReadTimestamp.localeCompare(left.lastReadTimestamp) || left.title.localeCompare(right.title);
    });
  }, [filter, libraryManga, query, sort]);

  const libraryIds = useMemo(() => new Set(libraryManga.map((manga) => manga.id)), [libraryManga]);

  useEffect(() => {
    try { window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(libraryManga)); } catch { /* Storage may be unavailable in a restricted webview. */ }
  }, [libraryManga]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = scrollPositions.current[activeDestination] ?? 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeDestination]);

  function navigate(destination: Destination) {
    if (contentRef.current) scrollPositions.current[activeDestination] = contentRef.current.scrollTop;
    setActiveDestination(destination);
  }

  function resetLibraryView() {
    setQuery("");
    setFilter("all");
  }

  function openLibraryDetails(manga: Manga) {
    if (contentRef.current) scrollPositions.current.library = contentRef.current.scrollTop;
    setSelectedManga(manga);
  }

  function closeLibraryDetails() {
    setSelectedManga(null);
    requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = scrollPositions.current.library ?? 0;
    });
  }

  function addToLibrary(manga: Manga) {
    setLibraryManga((items) => items.some((item) => item.id === manga.id) ? items : [...items, manga]);
  }

  function removeFromLibrary(id: string) {
    setLibraryManga((items) => items.filter((item) => item.id !== id));
  }

  function setBrowseDetails(open: boolean) {
    if (open && contentRef.current) scrollPositions.current.browse = contentRef.current.scrollTop;
    setBrowseDetailsOpen(open);
    requestAnimationFrame(() => {
      if (!contentRef.current) return;
      contentRef.current.scrollTop = open ? 0 : scrollPositions.current.browse ?? 0;
    });
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppShell activeDestination={activeDestination} contentRef={contentRef} onNavigate={navigate} isDetail={Boolean(selectedManga) || browseDetailsOpen}>
        {selectedManga ? (() => {
          const reference = sourceReference(selectedManga);
          return reference ? <MangaSourceDetails
            sourceId={reference.sourceId}
            summary={{ id: reference.mangaId, title: selectedManga.title, coverUrl: null, publicationStatus: selectedManga.publicationStatus, contentRating: null }}
            sourceName={selectedManga.sourceName}
            libraryIds={libraryIds}
            onAddToLibrary={addToLibrary}
            onRemoveFromLibrary={removeFromLibrary}
            onBack={closeLibraryDetails}
          /> : <MangaDetailsScreen
          manga={{ id: selectedManga.id, title: selectedManga.title, coverAsset: selectedManga.coverAsset, sourceName: selectedManga.sourceName, publicationStatus: selectedManga.publicationStatus, authors: null, artists: null, description: null, genres: null }}
          chapters={[]}
          isInLibrary
          onLibraryToggle={() => removeFromLibrary(selectedManga.id)}
          onBack={closeLibraryDetails}
          />;
        })() : activeDestination === "library" ? (
          <LibraryScreen
            manga={visibleManga}
            totalMangaCount={libraryManga.length}
            query={query}
            filter={filter}
            sort={sort}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
            onSortChange={setSort}
            onSelectManga={openLibraryDetails}
            onBrowse={() => navigate("browse")}
            onReset={resetLibraryView}
          />
        ) : activeDestination === "browse" ? <BrowseScreen onDetailsChange={setBrowseDetails} libraryIds={libraryIds} onAddToLibrary={addToLibrary} onRemoveFromLibrary={removeFromLibrary} scrollRef={contentRef} /> : null}
      </AppShell>
    </ThemeProvider>
  );
}

export default App;
