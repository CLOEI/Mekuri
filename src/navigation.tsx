import type { ElementType } from "react";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import type { Destination } from "./models";

export interface NavigationItem {
  id: Destination;
  label: string;
  description: string;
  icon: ElementType;
}

export const navigationItems: NavigationItem[] = [
  { id: "library", label: "Library", description: "Your saved manga", icon: MenuBookOutlinedIcon },
  { id: "browse", label: "Browse", description: "Discover manga", icon: ExploreOutlinedIcon },
];
