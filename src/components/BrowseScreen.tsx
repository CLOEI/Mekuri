import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, InputAdornment, List, ListItem, ListItemText, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import { MangaCard } from "./MangaCard";
import { MangaDetailsScreen } from "./MangaDetailsScreen";
import { fetchExtensionImage, inspectExtension, installStagedExtension, listExtensions, setExtensionEnabled, setExtensionLanguage, sourceCall, uninstallExtension, type Chapter, type ExtensionManifest, type InstalledExtension, type MangaDetails, type MangaPage, type PageReference, type SourceManga, type StagedExtension } from "../extensionApi";
import type { Manga } from "../models";

function readableError(error: unknown) {
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return error instanceof Error ? error.message : "The source operation failed.";
}

function ratingLabel(rating: string) { return rating.slice(0, 1).toUpperCase() + rating.slice(1); }

const coverResourceCache = new Map<string, string>();
const coverResourceRequests = new Map<string, Promise<string>>();

export function BrowseScreen({ onDetailsChange, libraryIds, onAddToLibrary, onRemoveFromLibrary, scrollRef }: { onDetailsChange?: (open: boolean) => void; libraryIds: Set<string>; onAddToLibrary: (manga: Manga) => void; onRemoveFromLibrary: (id: string) => void; scrollRef: RefObject<HTMLDivElement | null> }) {
  const [tab, setTab] = useState(0);
  const [extensions, setExtensions] = useState<InstalledExtension[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedExtension | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    try { setExtensions(await listExtensions()); setLoadError(null); } catch (error) { setLoadError(readableError(error)); }
  }
  useEffect(() => { void refresh(); }, []);

  async function onPackageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setLoadError(null);
    try { setStaged(await inspectExtension(Array.from(new Uint8Array(await file.arrayBuffer())))); }
    catch (error) { setLoadError(readableError(error)); }
    finally { setBusy(false); }
  }

  async function install(language?: string) {
    if (!staged) return;
    setBusy(true);
    try { await installStagedExtension(staged.stagingId, true, language); setStaged(null); await refresh(); }
    catch (error) { setLoadError(readableError(error)); }
    finally { setBusy(false); }
  }

  async function toggle(extension: InstalledExtension) {
    setBusy(true);
    try { await setExtensionEnabled(extension.extensionId, !extension.enabled); await refresh(); }
    catch (error) { setLoadError(readableError(error)); }
    finally { setBusy(false); }
  }

  async function changeLanguage(extension: InstalledExtension, language: string) {
    setBusy(true);
    try { await setExtensionLanguage(extension.extensionId, language); await refresh(); }
    catch (error) { setLoadError(readableError(error)); }
    finally { setBusy(false); }
  }

  async function remove(extension: InstalledExtension) {
    if (!window.confirm(`Uninstall ${extension.name}? Manga records and downloads are kept, but the source will become unavailable.`)) return;
    setBusy(true);
    try { await uninstallExtension(extension.extensionId, true); await refresh(); }
    catch (error) { setLoadError(readableError(error)); }
    finally { setBusy(false); }
  }

  return <>
    <Stack spacing={2.25} sx={{ maxWidth: 1120, mx: "auto" }}>
      <Box>
        <Typography variant="h1">Browse</Typography>
        <Typography color="text.secondary">Discover manga through source extensions you choose to install.</Typography>
      </Box>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Browse sections">
        <Tab label="Sources" />
        <Tab label={`Extensions${extensions.length ? ` (${extensions.length})` : ""}`} />
      </Tabs>
      {loadError && <Alert severity="error" action={<Button color="inherit" onClick={() => void refresh()}>Retry</Button>}>{loadError}</Alert>}
      {tab === 0 ? <SourcesPanel extensions={extensions} onDetailsChange={onDetailsChange} libraryIds={libraryIds} onAddToLibrary={onAddToLibrary} onRemoveFromLibrary={onRemoveFromLibrary} scrollRef={scrollRef} /> : <ExtensionsPanel extensions={extensions} busy={busy} onImport={() => fileInput.current?.click()} onToggle={toggle} onLanguage={changeLanguage} onRemove={remove} />}
    </Stack>
    <input ref={fileInput} hidden type="file" accept=".mekuri-ext,application/zip" onChange={(event) => void onPackageSelected(event)} />
    <ReviewDialog staged={staged} existing={staged ? extensions.find((extension) => extension.extensionId === staged.manifest.id) : undefined} busy={busy} onClose={() => setStaged(null)} onInstall={(language) => void install(language)} />
  </>;
}

function ExtensionsPanel({ extensions, busy, onImport, onToggle, onLanguage, onRemove }: { extensions: InstalledExtension[]; busy: boolean; onImport: () => void; onToggle: (extension: InstalledExtension) => void; onLanguage: (extension: InstalledExtension, language: string) => void; onRemove: (extension: InstalledExtension) => void; }) {
  return <Stack spacing={1.5}>
    <Paper variant="outlined" sx={{ p: 2, borderStyle: "dashed" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
        <Box><Typography variant="h2">Import an extension</Typography><Typography color="text.secondary" variant="body2">Packages are inspected before any extension code runs.</Typography></Box>
        <Button variant="contained" startIcon={<CloudUploadOutlinedIcon />} onClick={onImport}>Choose .mekuri-ext</Button>
      </Stack>
    </Paper>
    {extensions.length === 0 ? <EmptyState icon={<ExtensionOutlinedIcon />} title="No extensions installed" body="Import a source package to make it available under Sources." action={<Button variant="outlined" onClick={onImport}>Import extension</Button>} /> : extensions.map((extension) => <Paper key={extension.extensionId} variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><Box sx={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 2, color: "primary.light", backgroundColor: "rgba(131,212,200,.12)" }}><ExtensionOutlinedIcon /></Box><Box><Typography sx={{ fontWeight: 700 }}>{extension.name}</Typography><Typography variant="body2" color="text.secondary">v{extension.version} · {extension.language} · {extension.enabled ? "Enabled" : "Disabled"}</Typography></Box></Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" variant="outlined" label="Unsigned · user trusted" color="warning" /><IconButton aria-label={extension.enabled ? `Disable ${extension.name}` : `Enable ${extension.name}`} onClick={() => onToggle(extension)} disabled={busy}>{extension.enabled ? <ToggleOnOutlinedIcon color="primary" /> : <ToggleOffOutlinedIcon />}</IconButton><IconButton aria-label={`Uninstall ${extension.name}`} onClick={() => onRemove(extension)} disabled={busy}><DeleteOutlineOutlinedIcon /></IconButton></Stack>
      </Stack>
      {extension.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>{extension.description}</Typography>}
      {extension.languages && extension.languages.length > 1 && <TextField select size="small" label="Chapter language" value={extension.language} onChange={(event) => onLanguage(extension, event.target.value)} disabled={busy} sx={{ mt: 1.25, minWidth: 240 }}>{extension.languages.map((language) => <MenuItem key={language.code} value={language.code}>{language.label}</MenuItem>)}</TextField>}
      <Stack direction="row" spacing={1} sx={{ mt: 1.25, flexWrap: "wrap" }}><Chip size="small" label={ratingLabel(extension.contentRating)} /><Chip size="small" label={`Hosts: ${extension.requestedHosts.length || "none"}`} /><Chip size="small" label={extension.author ? `Author: ${extension.author}` : "Self-declared author not provided"} /></Stack>
    </Paper>)}
  </Stack>;
}

function SourcesPanel({ extensions, onDetailsChange, libraryIds, onAddToLibrary, onRemoveFromLibrary, scrollRef }: { extensions: InstalledExtension[]; onDetailsChange?: (open: boolean) => void; libraryIds: Set<string>; onAddToLibrary: (manga: Manga) => void; onRemoveFromLibrary: (id: string) => void; scrollRef: RefObject<HTMLDivElement | null> }) {
  const sources = extensions.filter((extension) => extension.enabled);
  const [selectedSource, setSelectedSource] = useState<string | null>(sources[0]?.extensionId ?? null);
  const [catalog, setCatalog] = useState<"popular" | "latest">("popular");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Array<{ card: Manga; source: SourceManga }>>([]);
  const [nextPage, setNextPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ sourceId: string; manga: SourceManga } | null>(null);
  const requestId = useRef(0);

  useEffect(() => { if (!selectedSource || !sources.some((source) => source.extensionId === selectedSource)) setSelectedSource(sources[0]?.extensionId ?? null); }, [extensions]);
  const loadPage = useCallback(async (page: number, replace: boolean) => {
    if (!selectedSource) return;
    const id = ++requestId.current;
    if (replace) {
      setLoadingInitial(true); setItems([]); setHasNextPage(false); setNextPage(1); setSelected(null);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const operation = query.trim() ? "search" : catalog === "latest" ? "getLatest" : "getPopular";
      const next = await sourceCall<MangaPage>(selectedSource, operation, query.trim() ? { query: query.trim(), page } : { page });
      const sourceName = extensions.find((source) => source.extensionId === selectedSource)?.name ?? "Source unavailable";
      const mapped = next.items.map((source) => ({
        source,
        card: {
          id: `${selectedSource}:${source.id}`,
          title: source.title,
          coverAsset: "",
          sourceName,
          publicationStatus: (source.publicationStatus as Manga["publicationStatus"]) ?? "ongoing",
          totalChapterCount: 0,
          unreadChapterCount: 0,
          downloadedChapterCount: 0,
          dateAdded: "",
          lastReadTimestamp: null,
        },
      }));
      if (id !== requestId.current) return;
      setItems((current) => replace ? mapped : [...current, ...mapped.filter((item) => !current.some((existing) => existing.card.id === item.card.id))]);
      setHasNextPage(next.hasNextPage);
      setNextPage(next.page + 1);
    } catch (operationError) {
      if (id === requestId.current) setError(readableError(operationError));
    } finally {
      if (id === requestId.current) { setLoadingInitial(false); setLoadingMore(false); }
    }
  }, [catalog, extensions, query, selectedSource]);

  useEffect(() => {
    if (!selectedSource) return;
    void loadPage(1, true);
    return () => { requestId.current += 1; };
  }, [loadPage, selectedSource]);

  const loadNextPage = useCallback(() => {
    if (!hasNextPage || loadingInitial || loadingMore) return;
    void loadPage(nextPage, false);
  }, [hasNextPage, loadPage, loadingInitial, loadingMore, nextPage]);

  if (sources.length === 0) return <EmptyState icon={<ExtensionOutlinedIcon />} title="No enabled sources" body="Install an extension, then enable it to browse its catalogue." />;
  if (selected) return <MangaSourceDetails sourceId={selected.sourceId} summary={selected.manga} sourceName={sources.find((source) => source.extensionId === selected.sourceId)?.name ?? "Source unavailable"} libraryIds={libraryIds} onAddToLibrary={onAddToLibrary} onRemoveFromLibrary={onRemoveFromLibrary} onBack={() => { setSelected(null); onDetailsChange?.(false); }} />;
  const active = sources.find((source) => source.extensionId === selectedSource) ?? sources[0];
  return <Stack spacing={2}>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}><TextField select label="Source" value={active.extensionId} onChange={(event) => setSelectedSource(event.target.value)} size="small" sx={{ minWidth: 220 }}>{sources.map((source) => <MenuItem key={source.extensionId} value={source.extensionId}>{source.name} · {source.language}</MenuItem>)}</TextField><TextField size="small" label="Search this source" value={query} onChange={(event) => setQuery(event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end"><SearchOutlinedIcon fontSize="small" /></InputAdornment> } }} sx={{ minWidth: { sm: 280 } }} /></Stack>
    <Tabs value={catalog} onChange={(_, value: "popular" | "latest") => setCatalog(value)} aria-label="Source catalogue"><Tab value="popular" label="Popular" /><Tab value="latest" label="Latest" /></Tabs>
    {loadingInitial ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 260 }}><CircularProgress /></Box> : error && !items.length ? <EmptyState title="Source request failed" body={error} action={<Button variant="outlined" onClick={() => void loadPage(1, true)}>Retry</Button>} /> : items.length ? <VirtualMangaGrid items={items} sourceId={selectedSource!} scrollRef={scrollRef} hasNextPage={hasNextPage} loadingMore={loadingMore} error={error} onLoadMore={loadNextPage} onRetry={() => void loadPage(nextPage, false)} onSelect={(item) => { setSelected({ sourceId: selectedSource!, manga: item.source }); onDetailsChange?.(true); }} /> : <EmptyState title="No titles found" body="This source returned no manga for the current page or search." />}
  </Stack>;
}

function VirtualMangaGrid({ items, sourceId, scrollRef, hasNextPage, loadingMore, error, onLoadMore, onRetry, onSelect }: { items: Array<{ card: Manga; source: SourceManga }>; sourceId: string; scrollRef: RefObject<HTMLDivElement | null>; hasNextPage: boolean; loadingMore: boolean; error: string | null; onLoadMore: () => void; onRetry: () => void; onSelect: (item: { card: Manga; source: SourceManga }) => void }) {
  const [columns, setColumns] = useState(2);
  const [scrollMargin, setScrollMargin] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const update = () => {
      setColumns(Math.max(1, Math.floor((node.clientWidth + 4) / 164)));
      const scrollElement = scrollRef.current;
      if (scrollElement) {
        const nextMargin = node.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop;
        setScrollMargin((current) => current === nextMargin ? current : nextMargin);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRef]);

  const dataRows = Math.ceil(items.length / columns);
  const rowCount = dataRows + (hasNextPage || loadingMore || error ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 260,
    overscan: 2,
    scrollMargin,
    getItemKey: (index) => index < dataRows ? items.slice(index * columns, (index + 1) * columns).map((item) => item.card.id).join("|") : "load-more",
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (hasNextPage && !loadingMore && !error && last && last.index >= rowCount - 2) onLoadMore();
  }, [error, hasNextPage, loadingMore, onLoadMore, rowCount, virtualRows]);

  return <Box ref={gridRef} role="list" aria-label="Source manga" sx={{ position: "relative", minHeight: 260, overflow: "hidden" }}>
    <Box sx={{ position: "relative", height: virtualizer.getTotalSize() }}>
      {virtualRows.map((row) => {
        const rowItems = row.index < dataRows ? items.slice(row.index * columns, (row.index + 1) * columns) : [];
        return <Box key={row.key} ref={virtualizer.measureElement} data-index={row.index} sx={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start - scrollMargin}px)`, px: 1, pb: .5 }}>
          {rowItems.length ? <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(128px, 160px))`, justifyContent: "start", gap: .5, alignItems: "start" }}>{rowItems.map((item, index) => <Box key={item.card.id} role="listitem"><SourceMangaCard item={item} sourceId={sourceId} eager={row.index === 0 && index < 6} onClick={() => onSelect(item)} /></Box>)}</Box> : <Stack sx={{ minHeight: 56, alignItems: "center", justifyContent: "center" }}>{loadingMore ? <CircularProgress size={24} aria-label="Loading more manga" /> : error ? <Button size="small" onClick={onRetry}>Retry loading more</Button> : hasNextPage ? <Typography variant="body2" color="text.secondary">Scroll to load more</Typography> : null}</Stack>}
        </Box>;
      })}
    </Box>
  </Box>;
}

function SourceMangaCard({ item, sourceId, eager, onClick }: { item: { card: Manga; source: SourceManga }; sourceId: string; eager: boolean; onClick: () => void }) {
  const coverUrl = item.source.coverUrl;
  const cacheKey = coverUrl ? `${sourceId}:${coverUrl}` : "";
  const [coverAsset, setCoverAsset] = useState(() => cacheKey ? coverResourceCache.get(cacheKey) ?? "" : "");
  useEffect(() => {
    let active = true;
    if (!coverUrl) { setCoverAsset(""); return () => { active = false; }; }
    const cached = coverResourceCache.get(cacheKey);
    if (cached) { setCoverAsset(cached); return () => { active = false; }; }
    const request = coverResourceRequests.get(cacheKey) ?? fetchExtensionImage(sourceId, coverUrl).then((resource) => {
      coverResourceCache.set(cacheKey, resource);
      coverResourceRequests.delete(cacheKey);
      return resource;
    }).catch((error) => { coverResourceRequests.delete(cacheKey); throw error; });
    coverResourceRequests.set(cacheKey, request);
    void request.then((resource) => active && setCoverAsset(resource)).catch(() => active && setCoverAsset(""));
    return () => { active = false; };
  }, [cacheKey, coverUrl, sourceId]);
  return <MangaCard manga={{ ...item.card, coverAsset }} eager={eager} onClick={onClick} />;
}

export function SourceDetails({ sourceId, summary, onBack }: { sourceId: string; summary: SourceManga; onBack: () => void }) {
  const [details, setDetails] = useState<MangaDetails | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pages, setPages] = useState<PageReference[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; void Promise.all([sourceCall<MangaDetails>(sourceId, "getManga", { mangaId: summary.id }), sourceCall<Chapter[]>(sourceId, "getChapters", { mangaId: summary.id })]).then(([nextDetails, nextChapters]) => { if (active) { setDetails(nextDetails); setChapters([...nextChapters].sort((left, right) => left.order - right.order)); } }).catch((operationError) => active && setError(readableError(operationError))).finally(() => active && setLoading(false)); return () => { active = false; }; }, [sourceId, summary.id]);
  if (pages) return <Reader sourceId={sourceId} pages={pages} title={details?.title ?? summary.title} onBack={() => setPages(null)} />;
  return <Stack spacing={2}><Button startIcon={<ArrowBackOutlinedIcon />} onClick={onBack} sx={{ alignSelf: "flex-start" }}>Back to {"source"}</Button>{loading ? <CircularProgress sx={{ alignSelf: "center", my: 8 }} /> : error ? <EmptyState title="Could not load manga" body={error} action={<Button onClick={onBack}>Back</Button>} /> : <><Stack direction={{ xs: "column", sm: "row" }} spacing={2}><Box sx={{ width: 150, aspectRatio: "2/3", borderRadius: 2, overflow: "hidden", backgroundColor: "#293333" }}>{summary.coverUrl && <RemoteImage sourceId={sourceId} url={details?.coverUrl ?? summary.coverUrl} alt="" />}</Box><Box><Typography variant="h1">{details?.title ?? summary.title}</Typography><Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5 }}>{(details?.publicationStatus ?? summary.publicationStatus) && <Chip size="small" label={details?.publicationStatus ?? summary.publicationStatus} />}{(details?.contentRating ?? summary.contentRating) && <Chip size="small" label={ratingLabel(details?.contentRating ?? summary.contentRating!)} />}</Stack><Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>{details?.description ?? "No description provided by the source."}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{details?.authors?.join(", ") ?? "Author unknown"}</Typography></Box></Stack><Divider /><Typography variant="h2">Chapters ({chapters.length})</Typography>{chapters.length ? <List disablePadding>{chapters.map((chapter) => <ListItem key={chapter.id} divider secondaryAction={chapter.externalUrl ? <Button onClick={() => void openUrl(chapter.externalUrl!)}>Open official</Button> : <Button onClick={() => void sourceCall<PageReference[]>(sourceId, "getPages", { chapterId: chapter.id }).then(setPages).catch((operationError) => setError(readableError(operationError)))}>Read</Button>}><ListItemText primary={chapter.title || (chapter.number == null ? "Chapter" : `Chapter ${chapter.number}`)} secondary={chapter.externalUrl ? "Official external chapter" : (chapter.publishedAt ?? "Publication date unknown")} /></ListItem>)}</List> : <Typography color="text.secondary">No chapters returned by this source.</Typography>}</>}</Stack>;
}

export function MangaSourceDetails({ sourceId, summary, sourceName, libraryIds, onAddToLibrary, onRemoveFromLibrary, onBack }: { sourceId: string; summary: SourceManga; sourceName: string; libraryIds: Set<string>; onAddToLibrary: (manga: Manga) => void; onRemoveFromLibrary: (id: string) => void; onBack: () => void }) {
  const [details, setDetails] = useState<MangaDetails | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pages, setPages] = useState<PageReference[] | null>(null);
  const [coverAsset, setCoverAsset] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [chaptersError, setChaptersError] = useState<string | null>(null);
  const [metadataRequest, setMetadataRequest] = useState(0);
  const [chaptersRequest, setChaptersRequest] = useState(0);

  useEffect(() => {
    let active = true;
    setMetadataLoading(true); setMetadataError(null);
    void sourceCall<MangaDetails>(sourceId, "getManga", { mangaId: summary.id })
      .then((value) => active && setDetails(value))
      .catch((error) => active && setMetadataError(readableError(error)))
      .finally(() => active && setMetadataLoading(false));
    return () => { active = false; };
  }, [metadataRequest, sourceId, summary.id]);

  useEffect(() => {
    let active = true;
    setChaptersLoading(true); setChaptersError(null);
    void sourceCall<Chapter[]>(sourceId, "getChapters", { mangaId: summary.id })
      .then((value) => active && setChapters([...value].sort((left, right) => left.order - right.order)))
      .catch((error) => active && setChaptersError(readableError(error)))
      .finally(() => active && setChaptersLoading(false));
    return () => { active = false; };
  }, [chaptersRequest, sourceId, summary.id]);

  const coverUrl = details?.coverUrl ?? summary.coverUrl;
  useEffect(() => {
    let active = true;
    setCoverAsset(null);
    if (coverUrl) void fetchExtensionImage(sourceId, coverUrl).then((value) => active && setCoverAsset(value)).catch(() => undefined);
    return () => { active = false; };
  }, [coverUrl, sourceId]);

  if (pages) return <LazyReader sourceId={sourceId} pages={pages} title={details?.title ?? summary.title} onBack={() => setPages(null)} />;
  const libraryId = `${sourceId}:${summary.id}`;
  const isInLibrary = libraryIds.has(libraryId);
  return <MangaDetailsScreen
    manga={{ id: libraryId, title: details?.title ?? summary.title, coverAsset, sourceName, publicationStatus: details?.publicationStatus ?? summary.publicationStatus, authors: details?.authors ?? null, artists: details?.artists ?? null, description: details?.description ?? null, genres: details?.genres ?? null }}
    chapters={chapters}
    metadataLoading={metadataLoading}
    chaptersLoading={chaptersLoading}
    metadataError={metadataError}
    chaptersError={chaptersError}
    onBack={onBack}
    isInLibrary={isInLibrary}
    onLibraryToggle={isInLibrary ? () => onRemoveFromLibrary(libraryId) : () => onAddToLibrary({ id: libraryId, sourceId, sourceMangaId: summary.id, title: details?.title ?? summary.title, coverAsset: coverAsset ?? "", sourceName, publicationStatus: details?.publicationStatus === "completed" || details?.publicationStatus === "hiatus" ? details.publicationStatus : "ongoing", totalChapterCount: chapters.length, unreadChapterCount: 0, downloadedChapterCount: 0, dateAdded: new Date().toISOString().slice(0, 10), lastReadTimestamp: null })}
    onRetryMetadata={() => setMetadataRequest((value) => value + 1)}
    onRetryChapters={() => setChaptersRequest((value) => value + 1)}
    onReadChapter={(chapter) => void sourceCall<PageReference[]>(sourceId, "getPages", { chapterId: chapter.id }).then(setPages).catch((error) => setChaptersError(readableError(error)))}
  />;
}

function LazyReader({ sourceId, pages, title, onBack }: { sourceId: string; pages: PageReference[]; title: string; onBack: () => void }) {
  const [resources, setResources] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState<Record<number, string>>({});
  const pageNodes = useRef(new Map<number, HTMLDivElement>());
  const loadingPages = useRef(new Set<number>());
  const load = useCallback(async (page: PageReference) => {
    if (loadingPages.current.has(page.index)) return;
    loadingPages.current.add(page.index);
    try {
      setFailed((value) => { const next = { ...value }; delete next[page.index]; return next; });
      const resource = await fetchExtensionImage(sourceId, page.imageUrl, page.referer);
      setResources((value) => ({ ...value, [page.index]: resource }));
    } catch (error) {
      setFailed((value) => ({ ...value, [page.index]: readableError(error) }));
    } finally {
      loadingPages.current.delete(page.index);
    }
  }, [sourceId]);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const page = pages.find((value) => value.index === Number((entry.target as HTMLElement).dataset.pageIndex));
        if (!page || resources[page.index] || failed[page.index]) continue;
        observer.unobserve(entry.target);
        void load(page);
      }
    }, { rootMargin: "900px 0px" });
    pageNodes.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [failed, load, pages, resources]);
  return <Stack spacing={1.5}><Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}><Button startIcon={<ArrowBackOutlinedIcon />} onClick={onBack}>Back to details</Button><Typography variant="h2">{title}</Typography><Typography variant="body2" color="text.secondary">{pages.length} pages</Typography></Stack><Stack spacing={1.5} sx={{ alignItems: "center" }}>{pages.map((page) => <Box key={page.index} ref={(node: HTMLDivElement | null) => { if (node) pageNodes.current.set(page.index, node); else pageNodes.current.delete(page.index); }} data-page-index={page.index} sx={{ width: "min(100%, 720px)", minHeight: 180, display: "grid", placeItems: "center", backgroundColor: "#0b1010", borderRadius: 1, overflow: "hidden" }}>{resources[page.index] ? <Box component="img" src={resources[page.index]} alt={`Page ${page.index + 1}`} sx={{ display: "block", maxWidth: "100%", height: "auto" }} onError={() => { setResources((value) => { const next = { ...value }; delete next[page.index]; return next; }); setFailed((value) => ({ ...value, [page.index]: "Image could not be displayed." })); }} /> : failed[page.index] ? <Stack spacing={1} sx={{ alignItems: "center", p: 3 }}><Typography color="error">{failed[page.index]}</Typography><Button size="small" onClick={() => void load(page)}>Retry</Button></Stack> : <CircularProgress size={28} />}</Box>)}</Stack></Stack>;
}

function Reader({ sourceId, pages, title, onBack }: { sourceId: string; pages: PageReference[]; title: string; onBack: () => void }) {
  const [resources, setResources] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState<Record<number, string>>({});
  useEffect(() => { let active = true; void Promise.all(pages.slice(0, 3).map(async (page) => [page.index, await fetchExtensionImage(sourceId, page.imageUrl, page.referer)] as const)).then((loaded) => active && setResources(Object.fromEntries(loaded))).catch(() => undefined); return () => { active = false; }; }, [pages, sourceId]);
  async function load(page: PageReference) { try { setFailed((value) => { const next = { ...value }; delete next[page.index]; return next; }); const resource = await fetchExtensionImage(sourceId, page.imageUrl, page.referer); setResources((value) => ({ ...value, [page.index]: resource })); } catch (error) { setFailed((value) => ({ ...value, [page.index]: readableError(error) })); } }
  return <Stack spacing={1.5}><Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}><Button startIcon={<ArrowBackOutlinedIcon />} onClick={onBack}>Back to details</Button><Typography variant="h2">{title}</Typography><Typography variant="body2" color="text.secondary">{pages.length} pages</Typography></Stack><Stack spacing={1.5} sx={{ alignItems: "center" }}>{pages.map((page) => <Box key={page.index} sx={{ width: "min(100%, 720px)", minHeight: 180, display: "grid", placeItems: "center", backgroundColor: "#0b1010", borderRadius: 1, overflow: "hidden" }}>{resources[page.index] ? <Box component="img" src={resources[page.index]} alt={`Page ${page.index + 1}`} sx={{ display: "block", maxWidth: "100%", height: "auto" }} onError={() => { setResources((value) => { const next = { ...value }; delete next[page.index]; return next; }); setFailed((value) => ({ ...value, [page.index]: "Image could not be displayed." })); }} /> : failed[page.index] ? <Stack spacing={1} sx={{ alignItems: "center", p: 3 }}><Typography color="error">{failed[page.index]}</Typography><Button size="small" onClick={() => void load(page)}>Retry</Button></Stack> : <CircularProgress size={28} />}</Box>)}</Stack></Stack>;
}

function RemoteImage({ sourceId, url, alt }: { sourceId: string; url: string; alt: string }) {
  const [resource, setResource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setResource(null);
    setFailed(false);
    void fetchExtensionImage(sourceId, url)
      .then((value) => active && setResource(value))
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [sourceId, url]);
  if (resource) return <Box component="img" src={resource} alt={alt} sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} onError={() => { setResource(null); setFailed(true); }} />;
  if (failed) return <Box role="img" aria-label={alt || "Cover unavailable"} sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary", backgroundColor: "#293333", fontSize: 12 }}>Cover unavailable</Box>;
  return <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}><CircularProgress size={22} /></Box>;
}

function ReviewDialog({ staged, existing, busy, onClose, onInstall }: { staged: StagedExtension | null; existing?: InstalledExtension; busy: boolean; onClose: () => void; onInstall: (language: string) => void }) {
  const manifest: ExtensionManifest | undefined = staged?.manifest;
  const [acknowledged, setAcknowledged] = useState(false);
  const [language, setLanguage] = useState("");
  const languageOptions = manifest?.languages?.length ? manifest.languages : manifest ? [{ code: manifest.language, label: manifest.language }] : [];
  useEffect(() => {
    setAcknowledged(false);
    const previous = existing?.language;
    setLanguage(languageOptions.some((option) => option.code === previous) ? previous! : languageOptions[0]?.code ?? "");
  }, [existing?.language, staged?.stagingId]);
  const newHosts = manifest?.requestedHosts.filter((host) => !existing?.requestedHosts.includes(host)) ?? [];
  return <Dialog open={Boolean(staged)} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm"><DialogTitle>Review extension package</DialogTitle><DialogContent dividers>{manifest && <Stack spacing={1.5}><Box><Typography variant="h2">{manifest.name} · v{manifest.version}</Typography><Typography color="text.secondary">{manifest.description || "No description provided."}</Typography></Box><Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}><Chip label={staged?.isUpdate ? `Update from v${staged.currentVersion}` : "New installation"} color="primary" /><Chip label={ratingLabel(manifest.contentRating)} /><Chip label="Unsigned · user trusted" color="warning" /></Stack><Typography variant="body2"><strong>Author:</strong> {manifest.author || "Self-declared author not provided"}</Typography>{languageOptions.length > 1 ? <TextField select label="Chapter language" value={language} onChange={(event) => setLanguage(event.target.value)} helperText="Used for chapter lists and reading.">{languageOptions.map((option) => <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}</TextField> : <Typography variant="body2"><strong>Language:</strong> {languageOptions[0]?.label ?? manifest.language}</Typography>}<Box><Typography variant="body2" sx={{ fontWeight: 700 }}>Requested hosts</Typography>{manifest.requestedHosts.length ? manifest.requestedHosts.map((host) => <Chip key={host} size="small" label={host} color={newHosts.includes(host) ? "primary" : "default"} sx={{ mr: .5, mt: .5 }} />) : <Typography variant="body2" color="text.secondary">None — this package does not request network access.</Typography>}{staged?.isUpdate && <Typography variant="caption" color="primary.light" sx={{ mt: .75, display: "block" }}>{newHosts.length ? `Newly requested: ${newHosts.join(", ")}` : "No new host permissions requested."}</Typography>}</Box><Alert severity="warning">This package is unsigned. Installing it gives its JavaScript the limited Mekuri host API and the permissions listed above. An author name is not publisher verification.</Alert><Button variant="outlined" onClick={() => setAcknowledged((value) => !value)} startIcon={acknowledged ? <CheckCircleOutlineOutlinedIcon color="success" /> : undefined}>{acknowledged ? "Unsigned package acknowledged" : "I understand and trust this unsigned package"}</Button></Stack>}</DialogContent><DialogActions><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="contained" onClick={() => onInstall(language)} disabled={busy || !acknowledged || !language}>{busy ? "Installing…" : staged?.isUpdate ? "Approve update" : "Trust and install"}</Button></DialogActions></Dialog>;
}

function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) { return <Stack sx={{ minHeight: 260, textAlign: "center", alignItems: "center", justifyContent: "center", px: 2 }} spacing={1}><Box sx={{ color: "primary.light" }}>{icon}</Box><Typography variant="h2">{title}</Typography><Typography color="text.secondary" sx={{ maxWidth: 420 }}>{body}</Typography>{action}</Stack>; }
