import { Box, Tab, Tabs } from "@mui/material";
import type { LibraryFilter } from "../models";

interface LibraryFiltersProps {
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
}

export function LibraryFilters({ filter, onFilterChange }: LibraryFiltersProps) {
  return (
    <Box sx={{ borderBottom: "1px solid", borderColor: "divider", mb: 2.5 }}>
      <Tabs
        value={filter}
        onChange={(_, value: LibraryFilter) => onFilterChange(value)}
        aria-label="Library filters"
        sx={{ minHeight: 42, "& .MuiTabs-indicator": { height: 2, borderRadius: 2, backgroundColor: "primary.main" }, "& .MuiTab-root": { minHeight: 42, minWidth: 0, mr: 2.5, p: 0, color: "text.secondary", fontSize: "0.85rem", fontWeight: 650, "&.Mui-selected": { color: "primary.light" } } }}
      >
        <Tab value="all" label="All" />
        <Tab value="unread" label="Unread" />
        <Tab value="completed" label="Completed" />
      </Tabs>
    </Box>
  );
}
