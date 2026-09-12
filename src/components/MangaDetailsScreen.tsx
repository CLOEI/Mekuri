import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import BookmarkAddedOutlinedIcon from "@mui/icons-material/BookmarkAddedOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import SortOutlinedIcon from "@mui/icons-material/SortOutlined";
import StatusOutlinedIcon from "@mui/icons-material/FlagOutlined";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Box, Button, Chip, CircularProgress, Dialog, DialogContent, Divider, Fab, IconButton, List, ListItem, ListItemButton, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import type { Chapter } from "../extensionApi";

export interface MangaDetailsData {
  id: string;
  title: string | null;
  coverAsset?: string | null;
  sourceName: string | null;
  publicationStatus: string | null;
  authors: string[] | null;
  artists: string[] | null;
  description: string | null;
  genres: string[] | null;
}

const detailViewState = new Map<string, { expanded: boolean; descending: boolean }>();

interface MangaDetailsScreenProps {
  manga: MangaDetailsData;
  chapters: Chapter[];
  metadataLoading?: boolean;
  chaptersLoading?: boolean;
  metadataError?: string | null;
  chaptersError?: string | null;
  onBack: () => void;
  onReadChapter?: (chapter: Chapter) => void;
  isInLibrary?: boolean;
  onLibraryToggle?: () => void;
  onRetryMetadata?: () => void;
  onRetryChapters?: () => void;
}

function titleFor(chapter: Chapter) {
  return chapter.title || (chapter.number == null ? "Chapter" : `Chapter ${chapter.number}`);
}

function uploadDateLabel(value: string | null) {
  if (!value) return "Upload date unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Upload date unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function statusLabel(status: string | null) {
  return status ? `${status.slice(0, 1).toUpperCase()}${status.slice(1)}` : "Status unknown";
}

export function MangaDetailsScreen({ manga, chapters, metadataLoading = false, chaptersLoading = false, metadataError = null, chaptersError = null, onBack, onReadChapter, isInLibrary = false, onLibraryToggle, onRetryMetadata, onRetryChapters }: MangaDetailsScreenProps) {
  const [expanded, setExpanded] = useState(() => detailViewState.get(manga.id)?.expanded ?? false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [descending, setDescending] = useState(() => detailViewState.get(manga.id)?.descending ?? true);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [titlePinned, setTitlePinned] = useState(false);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const visibleChapters = useMemo(() => [...chapters].sort((a, b) => descending ? b.order - a.order : a.order - b.order), [chapters, descending]);
  const firstReadable = useMemo(() => [...chapters].filter((chapter) => !chapter.externalUrl).sort((a, b) => a.order - b.order)[0], [chapters]);

  useEffect(() => {
    const node = titleRef.current;
    if (!node || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => setTitlePinned(!entry.isIntersecting), { threshold: 0, rootMargin: "-52px 0px 0px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [manga.id]);

  useEffect(() => {
    const state = detailViewState.get(manga.id);
    setExpanded(state?.expanded ?? false);
    setDescending(state?.descending ?? true);
    setCoverOpen(false);
  }, [manga.id]);

  useEffect(() => {
    detailViewState.set(manga.id, { expanded, descending });
  }, [descending, expanded, manga.id]);

  const author = manga.authors?.filter(Boolean).join(", ") || "Author unknown";
  const artist = manga.artists?.filter(Boolean).join(", ") || null;
  const showArtist = artist && artist !== author;
  const title = manga.title || "Title unknown";
  const synopsis = manga.description || "No description provided by the source.";

  return <Box sx={{ minHeight: "100%", pb: { xs: 13, md: 2 } }}>
    <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 4, height: 52, display: "flex", alignItems: "center", px: 1, backgroundColor: titlePinned ? "background.default" : "transparent", transition: "background-color 160ms ease" }}>
      <IconButton onClick={onBack} aria-label="Back to manga list"><ArrowBackOutlinedIcon /></IconButton>
      {titlePinned && <Typography noWrap sx={{ ml: 1, fontWeight: 700, minWidth: 0 }}>{title}</Typography>}
    </Box>
    <Box sx={{ display: { xs: "block", md: "grid" }, gridTemplateColumns: { md: "minmax(320px, 390px) minmax(0, 1fr)" }, alignItems: "start", maxWidth: 1280, mx: "auto" }}>
      <Box sx={{ minWidth: 0, position: { md: "sticky" }, top: { md: 16 }, maxHeight: { md: "calc(100dvh - 32px)" }, overflowY: { md: "auto" }, pb: { md: 2 } }}>
        <InfoPanel manga={manga} title={title} author={author} artist={artist} showArtist={Boolean(showArtist)} synopsis={synopsis} expanded={expanded} isInLibrary={isInLibrary} onLibraryToggle={onLibraryToggle} onToggleDescription={() => setExpanded((value) => !value)} onOpenCover={() => setCoverOpen(true)} titleRef={titleRef} />
        {metadataLoading && <Stack direction="row" spacing={1} sx={{ px: 2, pb: 2, alignItems: "center" }}><CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Loading details</Typography></Stack>}
        {metadataError && <InlineError message={metadataError} onRetry={onRetryMetadata} />}
      </Box>
      <Box sx={{ minWidth: 0, borderLeft: { md: "1px solid" }, borderColor: "divider", maxHeight: { md: "calc(100dvh - 32px)" }, overflowY: { md: "auto" }, pb: { xs: 0, md: 2 } }}>
        <ChapterSection chapters={visibleChapters} loading={chaptersLoading} error={chaptersError} onRetry={onRetryChapters} onReadChapter={onReadChapter} onSettings={(event) => setSettingsAnchor(event.currentTarget)} />
      </Box>
    </Box>
    {firstReadable && onReadChapter && <Fab variant="extended" color="primary" onClick={() => onReadChapter(firstReadable)} aria-label={`Start ${titleFor(firstReadable)}`} sx={{ position: "fixed", right: 20, bottom: "calc(84px + env(safe-area-inset-bottom))", zIndex: 5, display: { xs: "inline-flex", md: "none" }, color: "primary.contrastText" }}><PlayArrowOutlinedIcon sx={{ mr: .75 }} />Start</Fab>}
    <Menu anchorEl={settingsAnchor} open={Boolean(settingsAnchor)} onClose={() => setSettingsAnchor(null)}>
      <MenuItem selected={!descending} onClick={() => { setDescending(false); setSettingsAnchor(null); }}>Oldest first</MenuItem>
      <MenuItem selected={descending} onClick={() => { setDescending(true); setSettingsAnchor(null); }}>Newest first</MenuItem>
    </Menu>
    <Dialog open={coverOpen} onClose={() => setCoverOpen(false)} aria-labelledby="large-cover-title" maxWidth="sm"><DialogContent sx={{ p: 1.5 }}><Box component="img" src={manga.coverAsset || ""} alt={`Cover for ${title}`} sx={{ display: "block", maxWidth: "min(80vw, 460px)", maxHeight: "80vh", objectFit: "contain", borderRadius: 1 }} /><Typography id="large-cover-title" sx={{ pt: 1, px: .5 }}>{title}</Typography></DialogContent></Dialog>
  </Box>;
}

function InfoPanel({ manga, title, author, artist, showArtist, synopsis, expanded, isInLibrary, onLibraryToggle, onToggleDescription, onOpenCover, titleRef }: { manga: MangaDetailsData; title: string; author: string; artist: string | null; showArtist: boolean; synopsis: string; expanded: boolean; isInLibrary: boolean; onLibraryToggle?: () => void; onToggleDescription: () => void; onOpenCover: () => void; titleRef: RefObject<HTMLDivElement | null> }) {
  return <>
    <Box ref={titleRef} sx={{ position: "relative", overflow: "hidden", px: 2, pt: 1.5, pb: 2.25 }}>
      {manga.coverAsset && <Box aria-hidden="true" component="img" src={manga.coverAsset} sx={{ position: "absolute", inset: -8, width: "calc(100% + 16px)", height: "calc(100% + 16px)", objectFit: "cover", opacity: .2, filter: "blur(4px)", pointerEvents: "none", maskImage: "linear-gradient(to bottom, black 20%, transparent 100%)" }} />}
      <Stack direction={{ xs: "row", md: "column" }} spacing={2} sx={{ position: "relative", alignItems: { xs: "flex-start", md: "center" } }}>
        <Box component="button" type="button" onClick={onOpenCover} aria-label={`Enlarge cover for ${title}`} sx={{ appearance: "none", p: 0, flex: { xs: "0 0 100px", md: "0 0 auto" }, width: { xs: 100, md: "min(65%, 230px)" }, aspectRatio: "2 / 3", overflow: "hidden", border: "1px solid", borderColor: "divider", borderRadius: 1, backgroundColor: "#293333", cursor: "zoom-in", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>{manga.coverAsset ? <Box component="img" src={manga.coverAsset} alt="" sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} /> : <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "text.secondary", fontSize: 12 }}>No cover</Box>}</Box>
        <Stack spacing={.75} sx={{ minWidth: 0, pt: .25, alignItems: { md: "center" }, textAlign: { md: "center" } }}>
          <Typography component="h1" sx={{ fontSize: 22, lineHeight: 1.25, fontWeight: 700, overflowWrap: "anywhere" }}>{title}</Typography>
          <Meta icon={<PersonOutlineOutlinedIcon />} text={author} />
          {showArtist && artist && <Meta icon={<BrushOutlinedIcon />} text={artist} />}
          <Stack direction="row" spacing={.75} sx={{ flexWrap: "wrap", alignItems: "center", color: "text.secondary" }}><StatusOutlinedIcon sx={{ fontSize: 16 }} /><Typography variant="body2">{statusLabel(manga.publicationStatus)}</Typography>{manga.sourceName && <><Typography aria-hidden="true">·</Typography><Typography variant="body2">{manga.sourceName}</Typography></>}</Stack>
        </Stack>
      </Stack>
    </Box>
    {(onLibraryToggle || isInLibrary) && <Box sx={{ px: 2, pb: 1 }}>
      <Button disabled={isInLibrary && !onLibraryToggle} onClick={onLibraryToggle} aria-pressed={isInLibrary} sx={{ minHeight: 56, minWidth: 96, flexDirection: "column", gap: .5, color: isInLibrary ? "primary.main" : "text.secondary" }}>
        {isInLibrary ? <BookmarkAddedOutlinedIcon sx={{ fontSize: 20 }} /> : <BookmarkAddOutlinedIcon sx={{ fontSize: 20 }} />}
        <Typography component="span" sx={{ fontSize: 12, lineHeight: 1 }}>{isInLibrary ? "In Library" : "Add to Library"}</Typography>
      </Button>
    </Box>}
    <Box sx={{ px: 2, pb: 1.25 }}>
      <Box sx={{ position: "relative", maxHeight: { xs: expanded ? "none" : "7.35em", md: "none" }, overflow: "hidden" }}><Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55 }}>{synopsis}</Typography>{!expanded && <Box aria-hidden="true" sx={{ display: { xs: "block", md: "none" }, position: "absolute", right: 0, bottom: 0, left: 0, height: 32, background: "linear-gradient(transparent, #111718)" }} />}</Box>
      {manga.description && manga.description.length > 180 && <Button size="small" endIcon={expanded ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />} onClick={onToggleDescription} sx={{ display: { xs: "inline-flex", md: "none" }, mt: .25, ml: -.75 }}>{expanded ? "Show less" : "Show more"}</Button>}
      {manga.genres?.length ? <Stack direction="row" spacing={.75} sx={{ overflowX: { xs: expanded ? "visible" : "auto", md: "visible" }, flexWrap: { xs: expanded ? "wrap" : "nowrap", md: "wrap" }, pt: 1, pb: .5 }}>{manga.genres.map((genre) => <Chip key={genre} label={genre} size="small" variant="outlined" sx={{ flexShrink: 0 }} />)}</Stack> : null}
    </Box>
  </>;
}

function Meta({ icon, text }: { icon: ReactNode; text: string }) { return <Stack direction="row" spacing={.75} sx={{ alignItems: "center", color: "text.secondary", minWidth: 0 }}>{icon}<Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{text}</Typography></Stack>; }

function ChapterSection({ chapters, loading, error, onRetry, onReadChapter, onSettings }: { chapters: Chapter[]; loading: boolean; error: string | null; onRetry?: () => void; onReadChapter?: (chapter: Chapter) => void; onSettings: (event: React.MouseEvent<HTMLElement>) => void }) {
  return <Box component="section" aria-labelledby="chapters-heading"><Stack direction="row" sx={{ px: 2, py: .5, minHeight: 44, alignItems: "center", justifyContent: "space-between" }}><Typography id="chapters-heading" sx={{ fontSize: 16, fontWeight: 650 }}>Chapters ({chapters.length})</Typography><Tooltip title="Chapter order"><IconButton aria-label="Chapter settings" onClick={onSettings} size="small"><SortOutlinedIcon fontSize="small" /></IconButton></Tooltip></Stack><Divider />{loading ? <Stack sx={{ py: 5, alignItems: "center" }}><CircularProgress size={28} /></Stack> : error ? <InlineError message={error} onRetry={onRetry} /> : chapters.length ? <List disablePadding>{chapters.map((chapter) => <ChapterRow key={chapter.id} chapter={chapter} onRead={onReadChapter} />)}</List> : <Typography color="text.secondary" sx={{ px: 2, py: 3 }}>No chapters returned by this source.</Typography>}</Box>;
}

function ChapterRow({ chapter, onRead }: { chapter: Chapter; onRead?: (chapter: Chapter) => void }) {
  const external = chapter.externalUrl;
  async function openOfficial() { if (external) await openUrl(external); }
  return <ListItem disablePadding divider secondaryAction={external ? <Button size="small" startIcon={<OpenInNewOutlinedIcon />} onClick={() => void openOfficial()}>Official</Button> : undefined}><ListItemButton disabled={!external && !onRead} onClick={() => { if (!external) onRead?.(chapter); }} sx={{ px: 2, py: 1.5, pr: external ? 12 : 2, alignItems: "flex-start" }}><ListItemText primary={titleFor(chapter)} secondary={external ? "Official external chapter" : uploadDateLabel(chapter.publishedAt)} slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, lineHeight: 1.3 } }, secondary: { noWrap: true, sx: { mt: .75, fontSize: 12 } } }} /></ListItemButton></ListItem>;
}

function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) { return <Stack spacing={1} sx={{ px: 2, py: 3 }}><Typography color="error" variant="body2">{message}</Typography>{onRetry && <Button size="small" sx={{ alignSelf: "flex-start" }} onClick={onRetry}>Retry</Button>}</Stack>; }
