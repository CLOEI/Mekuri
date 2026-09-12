import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, Ref } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { PageReference } from "../extensionApi";
import { cachedPageImage, forgetPageImage, loadChapterPages, loadPageImage } from "../reader/pageLoader";
import { isReversedMode, readingAxis } from "../reader/readingMode";
import type { PageFit } from "../reader/readerSettings";
import { resolveTapAction } from "../reader/tapZones";
import type { ChapterDirection, ReaderViewerHandle, ReaderViewerProps, ViewerChapter } from "../reader/viewer";

/*
 * Discrete page viewer shared by the three paged modes. The modes differ only
 * in the track axis and its direction. Nothing here is shared with the webtoon
 * viewer, which keeps its own scroll and zoom handling.
 */

const minimumScale = 1;
const maximumScale = 4;
const zoomStep = 2;
const wheelCooldown = 220;
const preloadAhead = 2;
const preloadBehind = 1;

interface ZoomState { scale: number; x: number; y: number }

const restingZoom: ZoomState = { scale: minimumScale, x: 0, y: 0 };

type PagerItem =
  | { kind: "page"; key: string; page: PageReference }
  | { kind: "boundary"; key: string; direction: ChapterDirection; chapter: ViewerChapter | null };

function clamp(value: number, lowest: number, highest: number) {
  return Math.min(highest, Math.max(lowest, value));
}

/**
 * Pages arrive at whatever size the source published, so the fit decides which
 * edge is matched to the frame. Anything that then overflows is reached by
 * dragging, which is the same gesture used once a page is zoomed.
 *
 * Every fit gives the image a box the layout already knows the size of. Sizing
 * it from its own content instead and capping that with a percentage maximum
 * leaves the cap unresolved, which silently crops any page taller than the
 * frame.
 */
function fitStyle(fit: PageFit) {
  if (fit === "width") return { flex: "0 0 auto", alignSelf: "flex-start", width: "100%", height: "auto" } as const;
  if (fit === "height") return { flex: "0 0 auto", alignSelf: "stretch", height: "100%", width: "auto" } as const;
  if (fit === "original") return { flex: "0 0 auto", alignSelf: "flex-start", width: "auto", height: "auto" } as const;
  return { flex: "1 1 auto", alignSelf: "stretch", width: "100%", height: "100%", objectFit: "contain" } as const;
}

function buildItems(previousChapter: ViewerChapter | null, chapter: ViewerChapter, nextChapter: ViewerChapter | null): PagerItem[] {
  return [
    { kind: "boundary", key: `${chapter.id}:before`, direction: "previous", chapter: previousChapter },
    ...chapter.pages.map((page) => ({ kind: "page" as const, key: `${chapter.id}:${page.index}`, page })),
    { kind: "boundary", key: `${chapter.id}:after`, direction: "next", chapter: nextChapter },
  ];
}

/** Boundary items stand in for the first and last page when reporting progress. */
function pageIndexAt(items: PagerItem[], position: number) {
  const item = items[position];
  if (!item) return 0;
  if (item.kind === "page") return item.page.index;
  return item.direction === "previous" ? 0 : Math.max(0, items.length - 3);
}

export function PagerViewer({ ref, sourceId, previousChapter, chapter, nextChapter, mode, tapZones, pageFit, initialPage, onPageChanged, onRequestChapter, onMenu }: ReaderViewerProps & { ref?: Ref<ReaderViewerHandle> }) {
  const [chapters, setChapters] = useState({ previous: previousChapter, current: chapter, next: nextChapter });
  const [position, setPosition] = useState(0);
  const [zooms, setZooms] = useState<Record<string, ZoomState>>({});
  const frameRef = useRef<HTMLDivElement | null>(null);
  const initialPageRef = useRef(initialPage);
  const appliedChapterRef = useRef<string | null>(null);
  const wheelStampRef = useRef(0);
  const panRef = useRef<{ pointerId: number; x: number; y: number; origin: ZoomState; moved: boolean } | null>(null);

  const items = useMemo(() => buildItems(chapters.previous, chapters.current, chapters.next), [chapters]);
  const activeItem = items[position];
  const activeZoom = activeItem ? zooms[activeItem.key] ?? restingZoom : restingZoom;
  const axis = readingAxis(mode);
  const reversed = isReversedMode(mode);
  // A fit other than the screen fit can overflow the frame, so dragging moves
  // the page even before it is zoomed.
  const pannable = activeZoom.scale > minimumScale || pageFit !== "screen";

  useEffect(() => { initialPageRef.current = initialPage; }, [initialPage]);

  useEffect(() => { setChapters({ previous: previousChapter, current: chapter, next: nextChapter }); }, [chapter, nextChapter, previousChapter]);

  // A new chapter means a new item list, so the position and every remembered
  // zoom belong to pages that are no longer mounted.
  useEffect(() => {
    if (appliedChapterRef.current === chapters.current.id) return;
    appliedChapterRef.current = chapters.current.id;
    const pageCount = chapters.current.pages.length;
    setPosition(pageCount ? clamp(initialPageRef.current, 0, pageCount - 1) + 1 : 0);
    setZooms({});
  }, [chapters]);

  useEffect(() => {
    onPageChanged(chapters.current.id, pageIndexAt(items, position), chapters.current.pages.length);
  }, [chapters, items, onPageChanged, position]);

  useEffect(() => {
    const from = Math.max(0, position - preloadBehind);
    const to = Math.min(items.length - 1, position + preloadAhead);
    for (let cursor = from; cursor <= to; cursor += 1) {
      const item = items[cursor];
      if (item?.kind !== "page" || cachedPageImage(sourceId, item.page)) continue;
      void loadPageImage(sourceId, item.page).catch(() => undefined);
    }
  }, [items, position, sourceId]);

  const setZoom = useCallback((key: string, next: ZoomState) => {
    setZooms((value) => ({ ...value, [key]: next }));
  }, []);

  const step = useCallback((direction: ChapterDirection) => {
    setPosition((value) => {
      const target = direction === "next" ? value + 1 : value - 1;
      if (target >= 0 && target < items.length) return target;
      const edge = items[direction === "next" ? items.length - 1 : 0];
      if (edge?.kind === "boundary" && edge.chapter) onRequestChapter(direction);
      return value;
    });
  }, [items, onRequestChapter]);

  const handleTap = useCallback((x: number, y: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const action = resolveTapAction(tapZones, mode, x, y, frame.clientWidth, frame.clientHeight);
    if (action === "menu") { onMenu(); return; }
    step(action);
  }, [mode, onMenu, step, tapZones]);

  const handleKey = useCallback((key: string) => {
    const backward = axis === "horizontal" ? (reversed ? "ArrowRight" : "ArrowLeft") : "ArrowUp";
    const forward = axis === "horizontal" ? (reversed ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
    if (key === backward || key === "PageUp" || key === "AudioVolumeUp") { step("previous"); return true; }
    if (key === forward || key === "PageDown" || key === " " || key === "AudioVolumeDown") { step("next"); return true; }
    if (key === "Home") { setPosition(chapters.current.pages.length ? 1 : 0); return true; }
    if (key === "End") { setPosition(Math.max(0, items.length - 2)); return true; }
    return false;
  }, [axis, chapters, items.length, reversed, step]);

  useImperativeHandle(ref, () => ({
    setChapters: (previous, current, next) => setChapters({ previous, current, next }),
    moveToPage: (index) => setPosition(chapters.current.pages.length ? clamp(index, 0, chapters.current.pages.length - 1) + 1 : 0),
    currentPage: () => pageIndexAt(items, position),
    handleTap,
    handleKey,
    destroy: () => { panRef.current = null; setZooms({}); },
  }), [chapters, handleKey, handleTap, items, position]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeItem) return;
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: activeZoom, moved: false };
  }

  /** How far the page may travel before its far edge leaves the frame. */
  function panLimits(scale: number) {
    const frame = frameRef.current;
    const image = frame?.querySelector<HTMLImageElement>(`[data-slide="${activeItem?.key}"] img`);
    if (!frame || !image) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (image.clientWidth * scale - frame.clientWidth) / 2),
      y: Math.max(0, (image.clientHeight * scale - frame.clientHeight) / 2),
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !activeItem) return;
    const deltaX = event.clientX - pan.x;
    const deltaY = event.clientY - pan.y;
    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) pan.moved = true;
    if (!pannable) return;
    const limits = panLimits(pan.origin.scale);
    setZoom(activeItem.key, { scale: pan.origin.scale, x: clamp(pan.origin.x + deltaX, -limits.x, limits.x), y: clamp(pan.origin.y + deltaY, -limits.y, limits.y) });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    panRef.current = null;
    if (!pan || pan.pointerId !== event.pointerId || pan.moved) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    const frame = frameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    handleTap(event.clientX - bounds.left, event.clientY - bounds.top);
  }

  function onDoubleClick() {
    if (!activeItem) return;
    setZoom(activeItem.key, activeZoom.scale > minimumScale ? restingZoom : { scale: zoomStep, x: 0, y: 0 });
  }

  // Registered natively so the wheel never scrolls or zooms the webview
  // underneath the pager; React attaches wheel listeners passively.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !activeItem) return;
    function onWheel(event: WheelEvent) {
      if (!activeItem) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const scale = clamp(activeZoom.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), minimumScale, maximumScale);
        setZoom(activeItem.key, scale <= minimumScale ? restingZoom : { ...activeZoom, scale });
        return;
      }
      if (activeZoom.scale > minimumScale) {
        setZoom(activeItem.key, { ...activeZoom, x: activeZoom.x - event.deltaX, y: activeZoom.y - event.deltaY });
        return;
      }
      const now = Date.now();
      if (now - wheelStampRef.current < wheelCooldown) return;
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      wheelStampRef.current = now;
      step(delta > 0 ? "next" : "previous");
    }
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [activeItem, activeZoom, setZoom, step]);

  const trackDirection = axis === "vertical" ? "column" : reversed ? "row-reverse" : "row";
  const offset = reversed ? position * 100 : position * -100;
  const slide = axis === "vertical" ? `translateY(${position * -100}%)` : `translateX(${offset}%)`;

  return <Box
    ref={frameRef}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={() => { panRef.current = null; }}
    onDoubleClick={onDoubleClick}
    sx={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none", cursor: pannable ? "grab" : "default" }}
  >
    <Box sx={{ display: "flex", flexDirection: trackDirection, width: "100%", height: "100%", transform: slide, transition: "transform 220ms ease", willChange: "transform" }}>
      {items.map((item, index) => <Box key={item.key} data-slide={item.key} aria-hidden={index !== position} sx={{ flex: "0 0 100%", width: "100%", height: "100%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {item.kind === "page"
          ? <PagerPage sourceId={sourceId} page={item.page} zoom={zooms[item.key] ?? restingZoom} fit={pageFit} visible={index === position} />
          : <ChapterBoundary sourceId={sourceId} direction={item.direction} chapter={item.chapter} />}
      </Box>)}
    </Box>
  </Box>;
}

function PagerPage({ sourceId, page, zoom, fit, visible }: { sourceId: string; page: PageReference; zoom: ZoomState; fit: PageFit; visible: boolean }) {
  const [resource, setResource] = useState(() => cachedPageImage(sourceId, page));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const cached = cachedPageImage(sourceId, page);
    if (cached) { setResource(cached); setError(null); return () => { active = false; }; }
    setError(null);
    void loadPageImage(sourceId, page)
      .then((value) => active && setResource(value))
      .catch(() => active && setError("This page could not be loaded."));
    return () => { active = false; };
  }, [attempt, page, sourceId]);

  function retry() {
    forgetPageImage(sourceId, page);
    setResource(null);
    setAttempt((value) => value + 1);
  }

  if (error) return <Stack spacing={1} sx={{ alignItems: "center", p: 3 }}><Typography color="error" variant="body2">{error}</Typography><Button size="small" onClick={retry}>Retry</Button></Stack>;
  if (!resource) return <CircularProgress size={28} aria-label={`Loading page ${page.index + 1}`} />;
  return <Box component="img" src={resource} alt={`Page ${page.index + 1}`} loading={visible ? "eager" : "lazy"} decoding="async" draggable={false} onError={() => setError("This page could not be displayed.")} sx={{ display: "block", ...fitStyle(fit), transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: "center", transition: "transform 120ms ease", userSelect: "none" }} />;
}

/*
 * Explicit boundary page between chapters. Reaching it preloads the adjacent
 * chapter so stepping past it does not wait on the source.
 */
function ChapterBoundary({ sourceId, direction, chapter }: { sourceId: string; direction: ChapterDirection; chapter: ViewerChapter | null }) {
  useEffect(() => {
    if (!chapter) return;
    void loadChapterPages(sourceId, chapter.id).then((pages) => {
      const edge = direction === "next" ? pages[0] : pages[pages.length - 1];
      if (edge) void loadPageImage(sourceId, edge).catch(() => undefined);
    }).catch(() => undefined);
  }, [chapter, direction, sourceId]);

  return <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center", px: 3 }}>
    <Typography variant="body2" color="text.secondary">{direction === "next" ? "Next chapter" : "Previous chapter"}</Typography>
    <Typography sx={{ fontWeight: 650 }}>{chapter ? chapter.title : direction === "next" ? "There is no next chapter." : "There is no previous chapter."}</Typography>
    {chapter && <Typography variant="body2" color="text.secondary">{direction === "next" ? "Keep going to continue reading." : "Keep going back to continue reading."}</Typography>}
  </Stack>;
}
