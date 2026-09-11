import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import type { NavigationItem } from "../navigation";

interface PlaceholderScreenProps {
  item: NavigationItem;
}

export function PlaceholderScreen({ item }: PlaceholderScreenProps) {
  const Icon = item.icon;
  return (
    <Stack sx={{ minHeight: "min(60vh, 560px)", textAlign: "center", px: 3, alignItems: "center", justifyContent: "center" }}>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3, color: "primary.light", backgroundColor: "rgba(131, 212, 200, 0.06)" }}>
        <Icon sx={{ display: "block", fontSize: 28 }} />
      </Paper>
      <Typography component="h1" variant="h1" sx={{ mb: 1 }}>{item.label}</Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 330, mb: 2.5 }}>{item.label === "Updates" ? "New chapters for your saved titles will appear here." : item.label === "History" ? "Your recently read manga and chapters will appear here." : item.label === "Browse" ? "Find your next read through available sources." : "Settings and additional tools will live here."}</Typography>
      {item.id === "browse" && <Button variant="outlined" color="primary">Explore sources</Button>}
      {item.id !== "browse" && <Box sx={{ width: 52, height: 3, borderRadius: 99, backgroundColor: "primary.dark", opacity: 0.7 }} />}
    </Stack>
  );
}
