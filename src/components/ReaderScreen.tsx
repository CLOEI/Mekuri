import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { Box, Button, CircularProgress, Fade, IconButton, Stack, Typography } from "@mui/material";
import type { Chapter } from "../extensionApi";
import { loadChapterPages } from "../reader/pageLoader";
import { isPagedMode, readingModeLabels, resolveReadingMode, type ReadingMode } from "../reader/readingMode";
import type { ReaderSettings } from "../reader/readerSettings";
import type { ChapterDirection, ReaderViewerHandle, ViewerChapter } from "../reader/viewer";
import { PagerViewer } from "./PagerViewer";
import { ReaderSettingsSheet } from "./ReaderSettingsSheet";
import { WebtoonViewer } from "./WebtoonViewer";

/*
 * Reader controller. It owns the chapter loader, the page lists and the
 * resolved reading mode, and swaps between the two viewer implementations.
 * Both viewers report progress through the same callback, so anything reading
 * progress never learns which one was mounted.
 */

const modeToastDuration = 1800;
const menuAutoHideDelay = 2600;

const volumeKeys = new Set(["AudioVolumeUp", "AudioVolumeDown"]);
const consumedKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

interface ReaderScreenProps {
  sourceId: string;
  title: string;
  chapters: Chapter[];
  initialChapterId: string;
  settings: ReaderSettings;
  seriesReadingMode: ReadingMode;
  /** Hint carried by the source model, if it ever grows one. Sits between the series override and the global default. */
  sourceReadingMode?: ReadingMode | null;
  onSettingsChange: (settings: ReaderSettings) => void;
  onSeriesReadingModeChange: (mode: ReadingMode) => void;
  onProgress: (chapterId: string, pageIndex: number, pageCount: number) => void;
  onBack: () => void;
}

/** Everything the reader needs from the screens that launch it. */
export interface ReaderBridge {
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  readingModeFor: (mangaId: string) => ReadingMode;
  onReadingModeChange: (mangaId: string, mode: ReadingMode) => void;
  onProgress: (mangaId: string, chapterId: string, pageIndex: number, pageCount: number) => void;
}

function chapterTitle(chapter: Chapter) {
  return chapter.title || (chapter.number == null ? "Chapter" : `Chapter ${chapter.number}`);
}

export function ReaderScreen({ sourceId, title, chapters, initialChapterId, settings, seriesReadingMode, sourceReadingMode = null, onSettingsChange, onSeriesReadingModeChange, onProgress, onBack }: ReaderScreenProps) {
  const readable = useMemo(() => chapters.filter((value) => !value.externalUrl).sort((left, right) => left.order - right.order), [chapters]);
  const [currentChapterId, setCurrentChapterId] = useState(initialChapterId);
  const [initialPage, setInitialPage] = useState(0);
  const [pages, setPages] = useState<Record<string, ViewerChapter>>({});
  const [error, setError] = useState<string | null>(null);
  // The bar starts open so the settings entry is visible without having to
  // discover the centre tap zone, then gets out of the way on its own.
  const [menuOpen, setMenuOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [progress, setProgress] = useState({ index: 0, count: 0 });
  const viewerRef = useRef<ReaderViewerHandle | null>(null);
  const lastPageRef = useRef(new Map<string, number>());
  const autoHideRef = useRef(true);

  const toggleMenu = useCallback(() => {
    autoHideRef.current = false;
    setMenuOpen((value) => !value);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!autoHideRef.current) return;
      autoHideRef.current = false;
      setMenuOpen(false);
    }, menuAutoHideDelay);
    return () => window.clearTimeout(timer);
  }, []);

  const mode = resolveReadingMode(seriesReadingMode, sourceReadingMode, settings.readingMode);
  const position = readable.findIndex((value) => value.id === currentChapterId);
  const currentMeta = position >= 0 ? readable[position] : null;
  const previousMeta = position > 0 ? readable[position - 1] : null;
  const nextMeta = position >= 0 && position < readable.length - 1 ? readable[position + 1] : null;

  const loadChapter = useCallback((chapter: Chapter | null) => {
    if (!chapter) return;
    void loadChapterPages(sourceId, chapter.id)
      .then((value) => setPages((current) => current[chapter.id] ? current : { ...current, [chapter.id]: { id: chapter.id, title: chapterTitle(chapter), pages: value } }))
      .catch(() => undefined);
  }, [sourceId]);

  useEffect(() => {
    if (!currentMeta) { setError("This chapter is no longer in the chapter list."); return; }
    let active = true;
    setError(null);
    void loadChapterPages(sourceId, currentMeta.id)
      .then((value) => active && setPages((current) => ({ ...current, [currentMeta.id]: { id: currentMeta.id, title: chapterTitle(currentMeta), pages: value } })))
      .catch(() => active && setError("The pages for this chapter could not be loaded."));
    return () => { active = false; };
  }, [currentMeta, sourceId]);

  useEffect(() => { loadChapter(previousMeta); loadChapter(nextMeta); }, [loadChapter, nextMeta, previousMeta]);

  useEffect(() => {
    if (!settings.showModeOnOpen) return;
    setToastVisible(true);
    const timer = window.setTimeout(() => setToastVisible(false), modeToastDuration);
    return () => window.clearTimeout(timer);
  }, [mode, settings.showModeOnOpen]);

  const handlePageChanged = useCallback((chapterId: string, index: number, count: number) => {
    lastPageRef.current.set(chapterId, index);
    setProgress({ index, count });
    onProgress(chapterId, index, count);
  }, [onProgress]);

  const requestChapter = useCallback((direction: ChapterDirection) => {
    const target = direction === "next" ? nextMeta : previousMeta;
    if (!target) return;
    const remembered = lastPageRef.current.get(target.id);
    const landing = remembered ?? (direction === "next" ? 0 : Math.max(0, (pages[target.id]?.pages.length ?? 1) - 1));
    setInitialPage(landing);
    setCurrentChapterId(target.id);
  }, [nextMeta, pages, previousMeta]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); if (settingsOpen) return; if (menuOpen) setMenuOpen(false); else onBack(); return; }
      if (settingsOpen) return;
      if (event.key === "m" || event.key === "M") { event.preventDefault(); toggleMenu(); return; }
      if (volumeKeys.has(event.key) && !settings.volumeKeys) return;
      if (!volumeKeys.has(event.key) && !consumedKeys.has(event.key)) return;
      if (viewerRef.current?.handleKey(event.key)) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, onBack, settings.volumeKeys, settingsOpen, toggleMenu]);

  useEffect(() => () => viewerRef.current?.destroy(), []);

  const chapter = currentMeta ? pages[currentMeta.id] ?? null : null;
  const viewerProps = {
    sourceId,
    previousChapter: previousMeta ? pages[previousMeta.id] ?? null : null,
    chapter: chapter as ViewerChapter,
    nextChapter: nextMeta ? pages[nextMeta.id] ?? null : null,
    mode,
    tapZones: settings.tapZones,
    pageFit: settings.pageFit,
    initialPage,
    onPageChanged: handlePageChanged,
    onRequestChapter: requestChapter,
    onMenu: toggleMenu,
  };

  return <Box sx={{ position: "fixed", inset: 0, zIndex: (theme) => theme.zIndex.modal, backgroundColor: "#000" }}>
    {error
      ? <Stack spacing={2} sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 3, textAlign: "center" }}><Typography color="error">{error}</Typography><Button onClick={onBack}>Back to details</Button></Stack>
      : !chapter
        ? <Stack sx={{ height: "100%", alignItems: "center", justifyContent: "center" }}><CircularProgress aria-label="Loading chapter" /></Stack>
        : isPagedMode(mode)
          ? <PagerViewer key="pager" ref={viewerRef} {...viewerProps} />
          : <WebtoonViewer key="webtoon" ref={viewerRef} {...viewerProps} />}

    <Fade in={menuOpen}>
      <Stack direction="row" spacing={1} sx={{ position: "absolute", top: 0, right: 0, left: 0, minHeight: 56, px: 1, alignItems: "center", background: "linear-gradient(rgba(0, 0, 0, .78), transparent)", pointerEvents: menuOpen ? "auto" : "none" }}>
        <IconButton onClick={onBack} aria-label="Back to details" sx={{ color: "#fff" }}><ArrowBackOutlinedIcon /></IconButton>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ color: "#fff", fontWeight: 650, fontSize: 14 }}>{currentMeta ? chapterTitle(currentMeta) : title}</Typography>
          <Typography noWrap variant="body2" sx={{ color: "rgba(255, 255, 255, .7)", fontSize: 12 }}>{title}</Typography>
        </Box>
        <IconButton onClick={() => setSettingsOpen(true)} aria-label="Reader settings" sx={{ color: "#fff" }}><TuneOutlinedIcon /></IconButton>
      </Stack>
    </Fade>

    <Fade in={menuOpen}>
      <Box sx={{ position: "absolute", right: 0, bottom: 0, left: 0, px: 2, py: 1.5, textAlign: "center", background: "linear-gradient(transparent, rgba(0, 0, 0, .78))", pointerEvents: "none" }}>
        <Typography variant="body2" sx={{ color: "rgba(255, 255, 255, .85)" }}>{progress.count ? `Page ${progress.index + 1} of ${progress.count}` : "No pages"}</Typography>
      </Box>
    </Fade>

    <Fade in={toastVisible}>
      <Box sx={{ position: "absolute", top: 72, left: "50%", transform: "translateX(-50%)", px: 1.75, py: .75, borderRadius: 999, backgroundColor: "rgba(0, 0, 0, .74)", pointerEvents: "none" }}>
        <Typography variant="body2" sx={{ color: "#fff" }}>{readingModeLabels[mode]}</Typography>
      </Box>
    </Fade>

    <ReaderSettingsSheet
      open={settingsOpen}
      settings={settings}
      seriesReadingMode={seriesReadingMode}
      resolvedLabel={readingModeLabels[mode]}
      onClose={() => setSettingsOpen(false)}
      onSettingsChange={onSettingsChange}
      onSeriesReadingModeChange={onSeriesReadingModeChange}
    />
  </Box>;
}
