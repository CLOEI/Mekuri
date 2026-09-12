import { fetchExtensionImage, sourceCall, type PageReference } from "../extensionApi";

/**
 * Page lists and image resources are shared across viewers and across reader
 * sessions, so both caches live at module scope with an in-flight map that
 * collapses duplicate requests.
 */
const chapterPageCache = new Map<string, PageReference[]>();
const chapterPageRequests = new Map<string, Promise<PageReference[]>>();
const imageResourceCache = new Map<string, string>();
const imageResourceRequests = new Map<string, Promise<string>>();

function chapterKey(sourceId: string, chapterId: string) { return `${sourceId}:${chapterId}`; }

function imageKey(sourceId: string, imageUrl: string) { return `${sourceId}:${imageUrl}`; }

export function cachedChapterPages(sourceId: string, chapterId: string) {
  return chapterPageCache.get(chapterKey(sourceId, chapterId)) ?? null;
}

export function loadChapterPages(sourceId: string, chapterId: string) {
  const key = chapterKey(sourceId, chapterId);
  const cached = chapterPageCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = chapterPageRequests.get(key);
  if (pending) return pending;
  const request = sourceCall<PageReference[]>(sourceId, "getPages", { chapterId }).then((pages) => {
    const ordered = [...pages].sort((left, right) => left.index - right.index);
    chapterPageCache.set(key, ordered);
    chapterPageRequests.delete(key);
    return ordered;
  }).catch((error) => { chapterPageRequests.delete(key); throw error; });
  chapterPageRequests.set(key, request);
  return request;
}

export function cachedPageImage(sourceId: string, page: PageReference) {
  return imageResourceCache.get(imageKey(sourceId, page.imageUrl)) ?? null;
}

export function loadPageImage(sourceId: string, page: PageReference) {
  const key = imageKey(sourceId, page.imageUrl);
  const cached = imageResourceCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = imageResourceRequests.get(key);
  if (pending) return pending;
  const request = fetchExtensionImage(sourceId, page.imageUrl, page.referer).then((resource) => {
    imageResourceCache.set(key, resource);
    imageResourceRequests.delete(key);
    return resource;
  }).catch((error) => { imageResourceRequests.delete(key); throw error; });
  imageResourceRequests.set(key, request);
  return request;
}

/** Drops a failed image so a retry re-requests it from the host. */
export function forgetPageImage(sourceId: string, page: PageReference) {
  imageResourceCache.delete(imageKey(sourceId, page.imageUrl));
}
