import { useState } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import type { Manga } from "../models";

interface MangaCardProps {
  manga: Manga;
  eager?: boolean;
  onClick: (manga: Manga) => void;
}

const coverRadius = "4px";

export function MangaCard({ manga, eager = false, onClick }: MangaCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const initials = manga.title.split(" ").slice(0, 2).map((word) => word[0]).join("");
  const hasBadges = manga.downloadedChapterCount > 0 || manga.unreadChapterCount > 0;
  const badgeDescriptionId = `${manga.id}-count-description`;
  const titleId = `${manga.id}-title`;

  return (
    <ButtonBase
      component="button"
      type="button"
      onClick={() => onClick(manga)}
      aria-labelledby={titleId}
      aria-describedby={hasBadges ? badgeDescriptionId : undefined}
      sx={{
        display: "block",
        width: "100%",
        minWidth: 0,
        p: "4px",
        textAlign: "left",
        borderRadius: coverRadius,
        color: "text.primary",
        transition: "outline-color 140ms ease, background-color 140ms ease",
        "&:hover": { backgroundColor: "rgba(131, 212, 200, 0.08)" },
        "&:active": { backgroundColor: "rgba(131, 212, 200, 0.14)" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 0 },
      }}
    >
      <Box className="cover-frame" sx={{ position: "relative", width: "100%", aspectRatio: "2 / 3", overflow: "hidden", borderRadius: coverRadius, backgroundColor: "#293333" }}>
        {!imageLoaded && !imageFailed && <Box aria-hidden="true" sx={{ position: "absolute", inset: 0, backgroundColor: "#293333" }} />}
        {imageFailed ? (
          <CoverFallback initials={initials} />
        ) : (
          <Box component="img" src={manga.coverAsset} alt="" loading={eager ? "eager" : "lazy"} decoding="async" onLoad={() => setImageLoaded(true)} onError={() => { setImageFailed(true); setImageLoaded(false); }} sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", opacity: imageLoaded ? 1 : 0 }} />
        )}
        <Box aria-hidden="true" sx={{ position: "absolute", zIndex: 1, right: 0, bottom: 0, left: 0, height: "33%", pointerEvents: "none", background: "linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.67))" }} />
        <Typography id={titleId} component="span" sx={{ position: "absolute", zIndex: 1, right: 0, bottom: 0, left: 0, display: "-webkit-box", overflow: "hidden", px: "8px", py: "8px", color: "#fff", fontSize: "12px", lineHeight: "18px", fontWeight: 500, textShadow: "0 0 4px #000", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", pointerEvents: "none" }}>{manga.title}</Typography>
        {hasBadges && (
          <Box aria-hidden="true" sx={{ position: "absolute", zIndex: 2, top: "4px", left: "4px", display: "flex", overflow: "hidden", borderRadius: coverRadius, fontSize: "12px", lineHeight: "16px", fontWeight: 600 }}>
            {manga.downloadedChapterCount > 0 && <Box component="span" sx={{ px: "5px", py: "1px", color: "#e4fbf6", backgroundColor: "#23636a" }}>{manga.downloadedChapterCount}</Box>}
            {manga.unreadChapterCount > 0 && <Box component="span" sx={{ px: "5px", py: "1px", color: "#102322", backgroundColor: "primary.main" }}>{manga.unreadChapterCount}</Box>}
          </Box>
        )}
        {hasBadges && <Box component="span" id={badgeDescriptionId} sx={{ position: "absolute", width: 1, height: 1, p: 0, m: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>{[manga.downloadedChapterCount > 0 ? `${manga.downloadedChapterCount} downloaded chapters` : "", manga.unreadChapterCount > 0 ? `${manga.unreadChapterCount} unread chapters` : ""].filter(Boolean).join(". ")}</Box>}
      </Box>
    </ButtonBase>
  );
}

function CoverFallback({ initials }: { initials: string }) {
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", backgroundColor: "#293d3d", color: "primary.light" }}>
      <Typography aria-hidden="true" sx={{ fontWeight: 800, fontSize: "clamp(1.8rem, 5vw, 2.8rem)", letterSpacing: "0.08em" }}>{initials}</Typography>
    </Box>
  );
}
