import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ClearIcon from "@mui/icons-material/Clear";
import SortOutlinedIcon from "@mui/icons-material/SortOutlined";
import { Box, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, Select, TextField, Typography } from "@mui/material";
import type { LibrarySort } from "../models";

interface LibraryToolbarProps {
  count: number;
  query: string;
  sort: LibrarySort;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: LibrarySort) => void;
}

export function LibraryToolbar({ count, query, sort, onQueryChange, onSortChange }: LibraryToolbarProps) {
  return (
    <Box sx={{ display: "flex", alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 2.25 }}>
      <Box sx={{ minWidth: 150 }}>
        <Typography component="h1" variant="h1" sx={{ mb: 0.35 }}>Library</Typography>
        <Typography variant="body2" color="text.secondary">{count} saved {count === 1 ? "title" : "titles"}</Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: { xs: "100%", sm: "auto" }, flex: { sm: 1 }, justifyContent: { sm: "flex-end" } }}>
        <TextField
          size="small"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search library"
          aria-label="Search library"
          sx={{ flex: { xs: 1, sm: "0 1 280px" }, "& .MuiOutlinedInput-root": { borderRadius: 2.5, backgroundColor: "background.paper" } }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchOutlinedIcon fontSize="small" /></InputAdornment>,
              endAdornment: query ? <InputAdornment position="end"><IconButton size="small" onClick={() => onQueryChange("")} aria-label="Clear search"><ClearIcon fontSize="small" /></IconButton></InputAdornment> : undefined,
            },
          }}
        />
        <FormControl size="small" sx={{ minWidth: { xs: 48, sm: 174 } }}>
          <InputLabel id="library-sort-label">Sort</InputLabel>
          <Select
            labelId="library-sort-label"
            value={sort}
            label="Sort"
            onChange={(event) => onSortChange(event.target.value as LibrarySort)}
            startAdornment={<SortOutlinedIcon sx={{ mr: { xs: 0, sm: 0.75 }, fontSize: 19, color: "text.secondary", display: { xs: "none", sm: "block" } }} />}
            sx={{ borderRadius: 2.5, backgroundColor: "background.paper", "& .MuiSelect-select": { py: 1 } }}
          >
            <MenuItem value="title">Title A–Z</MenuItem>
            <MenuItem value="added">Recently added</MenuItem>
            <MenuItem value="read">Recently read</MenuItem>
          </Select>
        </FormControl>
      </Box>
    </Box>
  );
}
