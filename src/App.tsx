import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { AppShell } from "./components/AppShell";
import { LibraryScreen } from "./components/LibraryScreen";
import { MangaPreviewDialog } from "./components/MangaPreviewDialog";
import { PlaceholderScreen } from "./components/PlaceholderScreen";
import { mockManga } from "./data/mockManga";
import type { Destination, LibraryFilter, LibrarySort, Manga } from "./models";
import { navigationItems } from "./navigation";
import { theme } from "./theme";
import "./App.css";

function App() {
  const [activeDestination, setActiveDestination] = useState<Destination>("library");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("title");
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollPositions = useRef<Partial<Record<Destination, number>>>({});

  const visibleManga = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = mockManga.filter((manga) => {
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
  }, [filter, query, sort]);

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

  const activeItem = navigationItems.find((item) => item.id === activeDestination) ?? navigationItems[0];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppShell activeDestination={activeDestination} contentRef={contentRef} onNavigate={navigate}>
        {activeDestination === "library" ? (
          <LibraryScreen
            manga={visibleManga}
            totalMangaCount={mockManga.length}
            query={query}
            filter={filter}
            sort={sort}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
            onSortChange={setSort}
            onSelectManga={setSelectedManga}
            onBrowse={() => navigate("browse")}
            onReset={resetLibraryView}
          />
        ) : <PlaceholderScreen item={activeItem} />}
      </AppShell>
      <MangaPreviewDialog manga={selectedManga} onClose={() => setSelectedManga(null)} />
    </ThemeProvider>
  );
}

export default App;
