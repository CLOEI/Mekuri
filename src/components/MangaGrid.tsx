import { Box } from "@mui/material";
import type { Manga } from "../models";
import { MangaCard } from "./MangaCard";

interface MangaGridProps {
  manga: Manga[];
  onSelect: (manga: Manga) => void;
}

export function MangaGrid({ manga, onSelect }: MangaGridProps) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 160px))", justifyContent: "start", gap: "4px", alignItems: "start", p: "8px", overflow: "hidden" }}>
      {manga.map((item, index) => <MangaCard key={item.id} manga={item} eager={index < 6} onClick={onSelect} />)}
    </Box>
  );
}
