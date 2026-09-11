import type { ElementType } from "react";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import type { Destination } from "./models";

export interface NavigationItem {
  id: Destination;
  label: string;
  description: string;
  icon: ElementType;
}

export const navigationItems: NavigationItem[] = [
  { id: "library", label: "Library", description: "Your saved manga", icon: MenuBookOutlinedIcon },
  { id: "updates", label: "Updates", description: "New chapters", icon: SystemUpdateAltOutlinedIcon },
  { id: "history", label: "History", description: "Recently read", icon: HistoryOutlinedIcon },
  { id: "browse", label: "Browse", description: "Discover manga", icon: ExploreOutlinedIcon },
  { id: "more", label: "More", description: "Settings and tools", icon: MoreHorizOutlinedIcon },
];
