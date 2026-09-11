import type { ReactNode, RefObject } from "react";
import { Box } from "@mui/material";
import type { Destination } from "../models";
import { navigationItems } from "../navigation";
import { PrimaryNavigation } from "./PrimaryNavigation";

interface AppShellProps {
  activeDestination: Destination;
  contentRef: RefObject<HTMLDivElement | null>;
  onNavigate: (destination: Destination) => void;
  children: ReactNode;
}

export function AppShell({ activeDestination, contentRef, onNavigate, children }: AppShellProps) {
  const activeItem = navigationItems.find((item) => item.id === activeDestination) ?? navigationItems[0];
  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", backgroundColor: "background.default" }}>
      <PrimaryNavigation activeDestination={activeDestination} onNavigate={onNavigate} />
      <Box ref={contentRef} component="main" aria-label={`${activeItem.label} screen`} sx={{ flex: 1, minWidth: 0, height: "100dvh", overflowY: "auto", overflowX: "hidden", px: { xs: 2, sm: 3, md: 0, lg: 0 }, pl: { xs: 2, sm: 3, md: 0, lg: 0 }, pr: { xs: 2, sm: 3, md: 2, lg: 2 }, pt: { xs: 3, md: 4 }, pb: { xs: "calc(92px + env(safe-area-inset-bottom))", md: 5 } }}>
        <Box sx={{ width: "100%", ml: 0, mr: 0 }}>{children}</Box>
      </Box>
    </Box>
  );
}
