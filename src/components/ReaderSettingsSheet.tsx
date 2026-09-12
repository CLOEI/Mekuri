import { Box, Divider, Drawer, List, ListItemButton, ListItemText, Stack, Switch, Typography } from "@mui/material";
import { pageFitLabels, pageFits, tapZoneLabels, tapZoneLayouts, type PageFit, type ReaderSettings, type TapZoneLayout } from "../reader/readerSettings";
import { readingModeDescriptions, readingModeLabels, readingModes, type ReadingMode } from "../reader/readingMode";

interface ReaderSettingsSheetProps {
  open: boolean;
  settings: ReaderSettings;
  seriesReadingMode: ReadingMode;
  resolvedLabel: string;
  onClose: () => void;
  onSettingsChange: (settings: ReaderSettings) => void;
  onSeriesReadingModeChange: (mode: ReadingMode) => void;
}

export function ReaderSettingsSheet({ open, settings, seriesReadingMode, resolvedLabel, onClose, onSettingsChange, onSeriesReadingModeChange }: ReaderSettingsSheetProps) {
  // The reader itself sits at the modal layer, so the sheet has to be lifted
  // above it or it opens behind the page that launched it.
  return <Drawer anchor="bottom" open={open} onClose={onClose} sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }} slotProps={{ paper: { sx: { maxHeight: "80dvh", borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}>
    <Box sx={{ px: 2, pt: 2, pb: 1 }}>
      <Typography variant="h2">Reader</Typography>
      <Typography variant="body2" color="text.secondary">Currently reading in {resolvedLabel.toLocaleLowerCase()}</Typography>
    </Box>
    <Divider />
    <SectionTitle>Reading mode for this series</SectionTitle>
    <List disablePadding>
      {readingModes.map((mode) => <ListItemButton key={mode} selected={seriesReadingMode === mode} onClick={() => onSeriesReadingModeChange(mode)}>
        <ListItemText primary={readingModeLabels[mode]} secondary={mode === "DEFAULT" ? `${readingModeDescriptions[mode]} (${readingModeLabels[settings.readingMode].toLocaleLowerCase()})` : readingModeDescriptions[mode]} slotProps={{ primary: { sx: { fontSize: 14 } }, secondary: { sx: { fontSize: 12 } } }} />
      </ListItemButton>)}
    </List>
    <Divider />
    <SectionTitle>Global default</SectionTitle>
    <List disablePadding>
      {readingModes.filter((mode) => mode !== "DEFAULT").map((mode) => <ListItemButton key={mode} selected={settings.readingMode === mode} onClick={() => onSettingsChange({ ...settings, readingMode: mode })}>
        <ListItemText primary={readingModeLabels[mode]} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
      </ListItemButton>)}
    </List>
    <Divider />
    <SectionTitle>Page fit</SectionTitle>
    <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: .5, fontSize: 12 }}>The strip modes always match the page to the width unless you pick original size.</Typography>
    <List disablePadding>
      {pageFits.map((fit: PageFit) => <ListItemButton key={fit} selected={settings.pageFit === fit} onClick={() => onSettingsChange({ ...settings, pageFit: fit })}>
        <ListItemText primary={pageFitLabels[fit]} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
      </ListItemButton>)}
    </List>
    <Divider />
    <SectionTitle>Tap zones</SectionTitle>
    <List disablePadding>
      {tapZoneLayouts.map((layout: TapZoneLayout) => <ListItemButton key={layout} selected={settings.tapZones === layout} onClick={() => onSettingsChange({ ...settings, tapZones: layout })}>
        <ListItemText primary={tapZoneLabels[layout]} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
      </ListItemButton>)}
    </List>
    <Divider />
    <Stack sx={{ px: 2, py: 1 }}>
      <ToggleRow label="Volume keys" description="Page with the volume keys, or scroll in the strip modes" checked={settings.volumeKeys} onChange={(value) => onSettingsChange({ ...settings, volumeKeys: value })} />
      <ToggleRow label="Show reading mode on open" description="Briefly name the active mode when a chapter opens" checked={settings.showModeOnOpen} onChange={(value) => onSettingsChange({ ...settings, showModeOnOpen: value })} />
    </Stack>
  </Drawer>;
}

function SectionTitle({ children }: { children: string }) {
  return <Typography sx={{ px: 2, pt: 1.5, pb: .5, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "text.secondary" }}>{children}</Typography>;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", py: .5 }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 14 }}>{label}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>{description}</Typography>
    </Box>
    <Switch checked={checked} onChange={(event) => onChange(event.target.checked)} slotProps={{ input: { "aria-label": label } }} />
  </Stack>;
}
