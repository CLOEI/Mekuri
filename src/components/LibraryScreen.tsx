import { Button, Stack, Typography } from "@mui/material";
import type { LibraryFilter, LibrarySort, Manga } from "../models";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryToolbar } from "./LibraryToolbar";
import { MangaGrid } from "./MangaGrid";

interface LibraryScreenProps {
  manga: Manga[];
  totalMangaCount: number;
  query: string;
  filter: LibraryFilter;
  sort: LibrarySort;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: LibraryFilter) => void;
  onSortChange: (sort: LibrarySort) => void;
  onSelectManga: (manga: Manga) => void;
  onBrowse: () => void;
  onReset: () => void;
}

export function LibraryScreen({ manga, totalMangaCount, query, filter, sort, onQueryChange, onFilterChange, onSortChange, onSelectManga, onBrowse, onReset }: LibraryScreenProps) {
  return (
    <>
      <LibraryToolbar count={totalMangaCount} query={query} sort={sort} onQueryChange={onQueryChange} onSortChange={onSortChange} />
      <LibraryFilters filter={filter} onFilterChange={onFilterChange} />
      {manga.length > 0 ? <MangaGrid manga={manga} onSelect={onSelectManga} /> : <Stack sx={{ minHeight: 280, textAlign: "center", px: 2, alignItems: "center", justifyContent: "center" }}>
        <Typography variant="h2" sx={{ mb: 0.75 }}>{totalMangaCount === 0 ? "Your library is empty" : "No matches found"}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 340, mb: 2.25 }}>{totalMangaCount === 0 ? "Save manga from Browse to build your reading shelf." : "Try another title or reset your library view."}</Typography>
        {totalMangaCount === 0 ? <Button variant="outlined" onClick={onBrowse}>Browse sources</Button> : <Button variant="outlined" onClick={onReset}>Reset view</Button>}
      </Stack>}
    </>
  );
}
