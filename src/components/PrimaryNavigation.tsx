import { BottomNavigation, BottomNavigationAction, Drawer, List, ListItemButton, ListItemIcon, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import type { Destination } from "../models";
import { navigationItems } from "../navigation";

interface PrimaryNavigationProps {
  activeDestination: Destination;
  onNavigate: (destination: Destination) => void;
}

export function PrimaryNavigation({ activeDestination, onNavigate }: PrimaryNavigationProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  if (isDesktop) {
    return (
      <Drawer
        variant="permanent"
        component="nav"
        aria-label="Primary navigation"
        sx={{
          width: 104,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: 72,
            boxSizing: "border-box",
            top: "50%",
            left: 16,
            bottom: "auto",
            height: "auto",
            maxHeight: "calc(100dvh - 32px)",
            transform: "translateY(-50%)",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 5,
            backgroundColor: "#151b1c",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.28)",
            px: 1,
            py: 1,
          },
        }}
      >
        <List disablePadding sx={{ display: "grid", gap: 0.75 }}>
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const selected = activeDestination === item.id;
            return (
              <Tooltip key={item.id} title={item.label} placement="right">
                <ListItemButton
                  selected={selected}
                  onClick={() => onNavigate(item.id)}
                  aria-label={item.label}
                  aria-current={selected ? "page" : undefined}
                  sx={{
                    minHeight: 50,
                    justifyContent: "center",
                    borderRadius: 2.5,
                    px: 1,
                    color: selected ? "primary.light" : "text.secondary",
                    "&.Mui-selected": { backgroundColor: "rgba(131, 212, 200, 0.13)" },
                    "&.Mui-selected:hover, &:hover": { backgroundColor: selected ? "rgba(131, 212, 200, 0.18)" : "rgba(255,255,255,0.045)" },
                    "&.Mui-focusVisible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, color: "inherit", justifyContent: "center" }}><Icon /></ListItemIcon>
                </ListItemButton>
              </Tooltip>
            );
          })}
        </List>
      </Drawer>
    );
  }

  return (
    <BottomNavigation
      component="nav"
      aria-label="Primary navigation"
      value={activeDestination}
      onChange={(_, value: Destination) => onNavigate(value)}
      showLabels
      sx={{
        position: "fixed",
        zIndex: theme.zIndex.appBar,
        left: 0,
        right: 0,
        bottom: 0,
        minHeight: 68,
        height: "calc(68px + env(safe-area-inset-bottom))",
        alignItems: "flex-start",
        pt: 0.75,
        pb: "env(safe-area-inset-bottom)",
        borderTop: `1px solid ${theme.palette.divider}`,
        backgroundColor: "rgba(21, 27, 28, 0.98)",
        "& .MuiBottomNavigationAction-root": { minWidth: 44, minHeight: 56, px: 0.25, color: "text.secondary", gap: 0.25 },
        "& .MuiBottomNavigationAction-label": { fontSize: "0.68rem", fontWeight: 600 },
        "& .Mui-selected": { color: "primary.light" },
        "& .MuiBottomNavigationAction-root:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
      }}
    >
      {navigationItems.map((item) => {
        const Icon = item.icon;
        return <BottomNavigationAction key={item.id} value={item.id} label={item.label} icon={<Icon />} aria-label={item.label} />;
      })}
    </BottomNavigation>
  );
}
