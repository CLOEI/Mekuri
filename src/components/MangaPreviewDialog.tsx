import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DownloadDoneOutlinedIcon from "@mui/icons-material/DownloadDoneOutlined";
import { useEffect, useState } from "react";
import { Box, Chip, Dialog, DialogContent, IconButton, Stack, Typography } from "@mui/material";
import type { Manga } from "../models";

interface MangaPreviewDialogProps {
  manga: Manga | null;
  onClose: () => void;
}

function statusLabel(status: Manga["publicationStatus"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function MangaPreviewDialog({ manga, onClose }: MangaPreviewDialogProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [manga?.id]);

  return (
    <Dialog open={Boolean(manga)} onClose={onClose} aria-labelledby="manga-preview-title" fullWidth maxWidth="sm" slotProps={{ paper: { sx: { border: "1px solid", borderColor: "divider", backgroundColor: "background.paper", backgroundImage: "none", borderRadius: { xs: 2.5, sm: 3 } } } }}>
      {manga && (
        <DialogContent sx={{ p: { xs: 2, sm: 3 }, position: "relative" }}>
          <IconButton onClick={onClose} aria-label="Close manga preview" sx={{ position: "absolute", right: 10, top: 10, color: "text.secondary" }}><CloseOutlinedIcon /></IconButton>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 2, sm: 3 }} sx={{ pt: { xs: 2, sm: 1 }, alignItems: { xs: "center", sm: "stretch" } }}>
            {imageFailed ? (
              <Box sx={{ width: { xs: 130, sm: 150 }, alignSelf: { xs: "center", sm: "flex-start" }, aspectRatio: "2 / 3", display: "grid", placeItems: "center", borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "#293d3d", color: "primary.light" }}>
                <Typography sx={{ fontWeight: 800, letterSpacing: "0.08em" }}>{manga.title.split(" ").slice(0, 2).map((word) => word[0]).join("")}</Typography>
              </Box>
            ) : (
              <Box component="img" src={manga.coverAsset} alt="" sx={{ display: "block", width: { xs: 130, sm: 150 }, alignSelf: { xs: "center", sm: "flex-start" }, aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "#293d3d" }} onError={() => setImageFailed(true)} />
            )}
            <Stack sx={{ minWidth: 0, pt: { sm: 1 } }} spacing={1.5}>
              <Typography id="manga-preview-title" component="h2" variant="h2" sx={{ pr: 3 }}>{manga.title}</Typography>
              <Typography variant="body2" color="text.secondary">{manga.sourceName}</Typography>
              <Chip label={statusLabel(manga.publicationStatus)} size="small" sx={{ alignSelf: "flex-start", color: "primary.light", backgroundColor: "rgba(131,212,200,0.12)", border: "1px solid rgba(131,212,200,0.2)" }} />
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1, pt: 1 }}>
                <Detail label="Total" value={manga.totalChapterCount} />
                <Detail label="Unread" value={manga.unreadChapterCount} />
                <Detail label="Downloaded" value={manga.downloadedChapterCount} icon />
              </Box>
            </Stack>
          </Stack>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Detail({ label, value, icon = false }: { label: string; value: number; icon?: boolean }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>{label}</Typography><Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 700 }}>{value}</Typography>{icon && <DownloadDoneOutlinedIcon sx={{ fontSize: 15, color: "primary.main" }} />}</Stack></Box>;
}
