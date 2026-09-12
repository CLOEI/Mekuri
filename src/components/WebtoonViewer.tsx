import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { PageReference } from "../extensionApi";
import { cachedPageImage, forgetPageImage, loadPageImage } from "../reader/pageLoader";
import { hasStripGaps } from "../reader/readingMode";
import { resolveTapAction } from "../reader/tapZones";
import type { ChapterDirection, ReaderViewerHandle, ReaderViewerProps, ViewerChapter } from "../reader/viewer";
import { buildStripItems, currentStripItem, stripItemFor, type StripEntry, type StripItem } from "../reader/webtoonPosition";

/*
 * Continuous strip viewer for both long strip modes. Position is a scroll
 * offset and the current page is derived from whichever item covers the centre
 * of the viewport, so nothing here shares state with the paged viewer.
 */

const pageEstimate = 720;
const stripWidth = 900;
const stripGap = 8;
const scrollFraction = 0.9;
const minimumZoom = 1;
const maximumZoom = 3;
const zoomStep = 0.5;
const observerMargin = "900px 0px";

interface StripPage extends StripEntry { page: PageReference }

/**
 * Pages vary in size, so the space reserved for one comes from the dimensions
 * the source reported rather than a single shared guess.
 */
function estimateFor(page: PageReference, columnWidth: number) {
  if (!page.width || !page.height || page.width <= 0) return undefined;
  return Math.round(columnWidth * (page.height / page.width));
}

function buildEntries(previousChapter: ViewerChapter | null, chapter: ViewerChapter, nextChapter: ViewerChapter | null, columnWidth: number): StripPage[] {
  const chapters = [previousChapter, chapter, nextChapter].filter((value): value is ViewerChapter => value !== null);
  return chapters.flatMap((value) => value.pages.map((page) => ({ key: `${value.id}:${page.index}`, chapterId: value.id, index: page.index, estimate: estimateFor(page, columnWidth), page })));
}

function clamp(value: number, lowest: number, highest: number) {
  return Math.min(highest, Math.max(lowest, value));
}

export function WebtoonViewer({ ref, sourceId, previousChapter, chapter, nextChapter, mode, tapZones, pageFit, initialPage, onPageChanged, onRequestChapter, onMenu }: ReaderViewerProps & { ref?: Ref<ReaderViewerHandle> }) {
  const [chapters, setChapters] = useState({ previous: previousChapter, current: chapter, next: nextChapter });
  const [sizes, setSizes] = useState<Map<string, number>>(() => new Map());
  const [resources, setResources] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(minimumZoom);
  const [frameWidth, setFrameWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageNodes = useRef(new Map<string, HTMLElement>());
  const loadingKeys = useRef(new Set<string>());
  const failedKeys = useRef(new Set<string>());
  const frameRef = useRef(0);
  const initialPageRef = useRef(initialPage);
  const appliedChapterRef = useRef<string | null>(null);
  const centreRef = useRef<{ key: string; delta: number } | null>(null);
  const restoreRef = useRef<{ key: string; delta: number } | null>(null);
  const reportedRef = useRef<string | null>(null);
  const requestedRef = useRef<string | null>(null);
  const tapRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const zoomed = zoom > minimumZoom;
  const gap = hasStripGaps(mode) ? stripGap : 0;
  const columnWidth = Math.min(frameWidth || stripWidth, Math.round(stripWidth * zoom));
  const entries = useMemo(() => buildEntries(chapters.previous, chapters.current, chapters.next, columnWidth), [chapters, columnWidth]);
  const items = useMemo(() => buildStripItems(entries, sizes, pageEstimate, gap), [entries, gap, sizes]);
  const pagesByKey = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => { initialPageRef.current = initialPage; }, [initialPage]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setFrameWidth(node.clientWidth));
    observer.observe(node);
    setFrameWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    restoreRef.current = centreRef.current;
    setChapters({ previous: previousChapter, current: chapter, next: nextChapter });
  }, [chapter, nextChapter, previousChapter]);

  const pageCountFor = useCallback((chapterId: string) => {
    for (const value of [chapters.previous, chapters.current, chapters.next]) {
      if (value && value.id === chapterId) return value.pages.length;
    }
    return 0;
  }, [chapters]);

  const scrollToItem = useCallback((item: StripItem | null, behavior: ScrollBehavior = "auto") => {
    const node = scrollRef.current;
    if (!node || !item) return;
    node.scrollTo({ top: item.offset, behavior });
  }, []);

  const report = useCallback(() => {
    const node = scrollRef.current;
    const current = itemsRef.current;
    if (!node || !current.length) return;
    const centred = currentStripItem(current, node.scrollTop, node.clientHeight);
    if (!centred) return;
    centreRef.current = { key: centred.key, delta: centred.offset - node.scrollTop };
    const signature = `${centred.chapterId}:${centred.index}`;
    if (reportedRef.current !== signature) {
      reportedRef.current = signature;
      onPageChanged(centred.chapterId, centred.index, pageCountFor(centred.chapterId));
    }
    if (centred.chapterId === chapters.current.id) { requestedRef.current = null; return; }
    const direction: ChapterDirection = centred.chapterId === chapters.previous?.id ? "previous" : "next";
    if (requestedRef.current === centred.chapterId) return;
    requestedRef.current = centred.chapterId;
    onRequestChapter(direction);
  }, [chapters, onPageChanged, onRequestChapter, pageCountFor]);

  // Entering a chapter from the details screen starts at a requested page; the
  // same chapter reached by scrolling keeps the offset the reader already has.
  useLayoutEffect(() => {
    if (appliedChapterRef.current === chapters.current.id) return;
    const seen = appliedChapterRef.current !== null;
    appliedChapterRef.current = chapters.current.id;
    if (seen) return;
    scrollToItem(stripItemFor(itemsRef.current, chapters.current.id, initialPageRef.current));
  }, [chapters, scrollToItem]);

  // Rebuilding the strip after a chapter swap or a zoom change must not move
  // the page the reader is looking at.
  useLayoutEffect(() => {
    const anchor = restoreRef.current;
    const node = scrollRef.current;
    if (!anchor || !node) return;
    const item = items.find((value) => value.key === anchor.key);
    if (!item) return;
    restoreRef.current = null;
    node.scrollTop = item.offset - anchor.delta;
  }, [items]);

  useEffect(() => { report(); }, [report]);

  const load = useCallback(async (key: string) => {
    const entry = pagesByKey.get(key);
    if (!entry || loadingKeys.current.has(key) || failedKeys.current.has(key)) return;
    const cached = cachedPageImage(sourceId, entry.page);
    if (cached) { setResources((value) => value[key] ? value : { ...value, [key]: cached }); return; }
    loadingKeys.current.add(key);
    try {
      const resource = await loadPageImage(sourceId, entry.page);
      setResources((value) => ({ ...value, [key]: resource }));
    } catch {
      failedKeys.current.add(key);
      setFailed((value) => ({ ...value, [key]: "This page could not be loaded." }));
    } finally {
      loadingKeys.current.delete(key);
    }
  }, [pagesByKey, sourceId]);

  const retry = useCallback((key: string, page: PageReference) => {
    forgetPageImage(sourceId, page);
    failedKeys.current.delete(key);
    setFailed((value) => { const next = { ...value }; delete next[key]; return next; });
    void load(key);
  }, [load, sourceId]);

  // Measuring and lazy loading are both driven off the same nodes, but neither
  // observer depends on load state, so the strip is only re-observed when the
  // chapter window changes.
  useEffect(() => {
    const sizeObserver = new ResizeObserver((observed) => {
      setSizes((value) => {
        let changed = false;
        const next = new Map(value);
        for (const entry of observed) {
          const key = (entry.target as HTMLElement).dataset.pageKey;
          const height = Math.round(entry.contentRect.height);
          if (!key || !height || next.get(key) === height) continue;
          next.set(key, height);
          changed = true;
        }
        return changed ? next : value;
      });
    });
    const visibilityObserver = new IntersectionObserver((observed) => {
      for (const entry of observed) {
        const key = (entry.target as HTMLElement).dataset.pageKey;
        if (entry.isIntersecting && key) void load(key);
      }
    }, { rootMargin: observerMargin });
    pageNodes.current.forEach((node) => { sizeObserver.observe(node); visibilityObserver.observe(node); });
    return () => { sizeObserver.disconnect(); visibilityObserver.disconnect(); };
  }, [entries, load]);

  const scrollByFraction = useCallback((direction: ChapterDirection) => {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.clientHeight * scrollFraction;
    node.scrollBy({ top: direction === "next" ? distance : -distance, behavior: "smooth" });
  }, []);

  const handleTap = useCallback((x: number, y: number) => {
    const node = scrollRef.current;
    if (!node) return;
    const action = resolveTapAction(tapZones, mode, x, y, node.clientWidth, node.clientHeight);
    if (action === "menu") { onMenu(); return; }
    scrollByFraction(action);
  }, [mode, onMenu, scrollByFraction, tapZones]);

  const handleKey = useCallback((key: string) => {
    const node = scrollRef.current;
    if (!node) return false;
    if (key === "ArrowUp" || key === "PageUp" || key === "AudioVolumeUp") { scrollByFraction("previous"); return true; }
    if (key === "ArrowDown" || key === "PageDown" || key === " " || key === "AudioVolumeDown") { scrollByFraction("next"); return true; }
    if (key === "Home") { node.scrollTo({ top: 0 }); return true; }
    if (key === "End") { node.scrollTo({ top: node.scrollHeight }); return true; }
    return false;
  }, [scrollByFraction]);

  useImperativeHandle(ref, () => ({
    setChapters: (previous, current, next) => { restoreRef.current = centreRef.current; setChapters({ previous, current, next }); },
    moveToPage: (index) => scrollToItem(stripItemFor(itemsRef.current, chapters.current.id, index), "smooth"),
    currentPage: () => {
      const node = scrollRef.current;
      if (!node) return 0;
      return currentStripItem(itemsRef.current, node.scrollTop, node.clientHeight)?.index ?? 0;
    },
    handleTap,
    handleKey,
    destroy: () => { pageNodes.current.clear(); loadingKeys.current.clear(); failedKeys.current.clear(); cancelAnimationFrame(frameRef.current); },
  }), [chapters, handleKey, handleTap, scrollToItem]);

  function onScroll() {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(report);
  }

  const applyZoom = useCallback((next: number) => {
    restoreRef.current = centreRef.current;
    setZoom(clamp(next, minimumZoom, maximumZoom));
  }, []);

  // Registered natively so the pinch gesture zooms the strip instead of the
  // whole webview; React attaches wheel listeners passively.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      applyZoom(zoom + (event.deltaY < 0 ? zoomStep : -zoomStep));
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyZoom, zoom]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    tapRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const tap = tapRef.current;
    const node = scrollRef.current;
    tapRef.current = null;
    if (!node || !tap || tap.pointerId !== event.pointerId) return;
    // A drag that scrolled the strip is not a tap.
    if (Math.abs(event.clientX - tap.x) > 6 || Math.abs(event.clientY - tap.y) > 6) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    const bounds = node.getBoundingClientRect();
    handleTap(event.clientX - bounds.left, event.clientY - bounds.top);
  }

  return <Box
    ref={scrollRef}
    onScroll={onScroll}
    onPointerDown={onPointerDown}
    onPointerUp={onPointerUp}
    onDoubleClick={() => applyZoom(zoom >= maximumZoom ? minimumZoom : zoom + zoomStep)}
    sx={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: zoomed ? "auto" : "hidden", overscrollBehavior: "contain" }}
  >
    {/* A zoomed strip is wider than the frame, and an auto margin would put its
        left edge out of reach of the horizontal scroll. */}
    <Box sx={{ display: "flex", flexDirection: "column", rowGap: `${gap}px`, width: zoomed ? `${Math.round(stripWidth * zoom)}px` : "100%", maxWidth: zoomed ? "none" : `${stripWidth}px`, mx: zoomed ? 0 : "auto" }}>
      {entries.map((entry) => <Box
        key={entry.key}
        data-page-key={entry.key}
        ref={(node: HTMLElement | null) => { if (node) pageNodes.current.set(entry.key, node); else pageNodes.current.delete(entry.key); }}
        sx={{ width: "100%", minHeight: resources[entry.key] ? 0 : entry.estimate ?? pageEstimate, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0b1010" }}
      >
        {resources[entry.key]
          ? <Box component="img" src={resources[entry.key]} alt={`Page ${entry.index + 1}`} decoding="async" draggable={false} onError={() => { failedKeys.current.add(entry.key); setResources((value) => { const next = { ...value }; delete next[entry.key]; return next; }); setFailed((value) => ({ ...value, [entry.key]: "This page could not be displayed." })); }} sx={{ display: "block", flex: "0 0 auto", width: pageFit === "original" ? "auto" : "100%", maxWidth: "100%", maxHeight: pageFit === "height" ? "100dvh" : "none", height: "auto", userSelect: "none" }} />
          : failed[entry.key]
            ? <Stack spacing={1} sx={{ alignItems: "center", p: 3 }}><Typography color="error" variant="body2">{failed[entry.key]}</Typography><Button size="small" onClick={() => retry(entry.key, entry.page)}>Retry</Button></Stack>
            : <CircularProgress size={28} aria-label={`Loading page ${entry.index + 1}`} />}
      </Box>)}
    </Box>
  </Box>;
}
