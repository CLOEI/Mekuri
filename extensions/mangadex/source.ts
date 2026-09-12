/*
 * MangaDex source for the Mekuri host API 1.0.
 *
 * This file is deliberately site-specific. The Mekuri core only provides the
 * small HTTP/settings host API and validates the values returned below.
 */

declare const mekuri: {
  http: { get(url: string): Promise<string> };
  settings: { get(key: string): string | null };
  log(message: string): void;
};

const API = "https://api.mangadex.org";
const PAGE_SIZE = 24;
const CHAPTER_BATCH = 100;
const ENGLISH = "en";
const CHAPTER_LANGUAGES = new Set(["en", "es", "es-la", "pt-br", "fr", "de", "it", "id", "pl", "ru", "tr", "vi", "th", "ja", "ko", "zh", "zh-hk"]);

function selectedLanguage() {
  const language = mekuri.settings.get("language");
  return language && CHAPTER_LANGUAGES.has(language) ? language : ENGLISH;
}

type JsonObject = Record<string, any>;

function query(parameters: Record<string, string | number | undefined>) {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

async function getJson<T>(path: string): Promise<T> {
  const body = await mekuri.http.get(`${API}${path}`);
  const value = JSON.parse(body) as T;
  if (!value || typeof value !== "object") throw new Error("MangaDex returned an invalid response.");
  return value;
}

function localized(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const values = value as Record<string, unknown>;
  for (const language of [selectedLanguage(), ENGLISH, "ja-ro", "ja", "ko", "zh", "zh-hk"]) {
    if (typeof values[language] === "string" && values[language].trim()) return values[language].trim();
  }
  for (const candidate of Object.values(values)) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function plainText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .trim() || null;
}

function relationships(item: JsonObject, type: string): JsonObject[] {
  return Array.isArray(item.relationships)
    ? item.relationships.filter((relationship: JsonObject) => relationship?.type === type)
    : [];
}

function coverUrl(item: JsonObject): string | null {
  const relationship = relationships(item, "cover_art")[0];
  const fileName = relationship?.attributes?.fileName;
  if (typeof item.id !== "string" || typeof fileName !== "string" || !fileName) return null;
  return `https://uploads.mangadex.org/covers/${encodeURIComponent(item.id)}/${encodeURIComponent(fileName)}.256.jpg`;
}

function rating(value: unknown): string | null {
  if (value === "safe") return "safe";
  if (value === "suggestive") return "teen";
  if (value === "erotica" || value === "pornographic") return "mature";
  return null;
}

function status(value: unknown): string | null {
  if (value === "ongoing" || value === "completed" || value === "hiatus" || value === "cancelled") return value;
  return null;
}

function summary(item: JsonObject) {
  const title = localized(item.attributes?.title);
  if (typeof item.id !== "string" || !title) throw new Error("MangaDex returned a manga without a stable ID or title.");
  return {
    id: item.id,
    title,
    coverUrl: coverUrl(item),
    publicationStatus: status(item.attributes?.status),
    contentRating: rating(item.attributes?.contentRating),
  };
}

function paginated(value: JsonObject, page: number) {
  if (!Array.isArray(value.data)) throw new Error("MangaDex returned an invalid manga page.");
  const offset = (page - 1) * PAGE_SIZE;
  const total = typeof value.total === "number" ? value.total : offset + value.data.length;
  return {
    items: value.data.map(summary),
    page,
    hasNextPage: offset + value.data.length < total,
  };
}

async function listManga(page: number, title?: string, order: "popular" | "latest" = "popular") {
  const offset = (page - 1) * PAGE_SIZE;
  const parameters: Record<string, string | number | undefined> = {
    limit: PAGE_SIZE,
    offset,
    "includes[]": "cover_art",
  };
  if (title) parameters.title = title;
  else if (order === "latest") parameters["order[latestUploadedChapter]"] = "desc";
  else parameters["order[followedCount]"] = "desc";
  const value = await getJson<JsonObject>(`/manga?${query(parameters)}`);
  return paginated(value, page);
}

function names(item: JsonObject, type: string): string[] | null {
  const result = relationships(item, type)
    .map((relationship) => relationship.attributes?.name)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    .map((name) => name.trim());
  return result.length ? Array.from(new Set(result)) : null;
}

function detail(item: JsonObject) {
  const basic = summary(item);
  return {
    ...basic,
    description: plainText(localized(item.attributes?.description)),
    authors: names(item, "author"),
    artists: names(item, "artist"),
    genres: Array.isArray(item.attributes?.tags)
      ? Array.from(new Set(item.attributes.tags
          .map((tag: JsonObject) => localized(tag?.attributes?.name))
          .filter((name: string | null): name is string => Boolean(name))))
      : null,
  };
}

function chapterNumber(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function chapterDate(attributes: JsonObject): string | null {
  for (const field of ["publishAt", "readableAt", "createdAt", "publishedAt"]) {
    const value = attributes[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function chapterValue(item: JsonObject) {
  const attributes = item.attributes ?? {};
  const number = chapterNumber(attributes.chapter);
  const volume = typeof attributes.volume === "string" && attributes.volume.trim() ? attributes.volume : null;
  const title = typeof attributes.title === "string" && attributes.title.trim() ? attributes.title.trim() : null;
  const externalUrl = typeof attributes.externalUrl === "string" && attributes.externalUrl.startsWith("https://")
    ? attributes.externalUrl
    : null;
  return {
    id: item.id,
    title: title ? (number === null ? title : `Chapter ${attributes.chapter}: ${title}`) : (number === null ? "Chapter" : `Chapter ${attributes.chapter}`),
    number,
    volume,
    publishedAt: chapterDate(attributes),
    externalUrl,
  };
}

function compareChapters(left: JsonObject, right: JsonObject): number {
  const leftNumber = chapterNumber(left.attributes?.chapter);
  const rightNumber = chapterNumber(right.attributes?.chapter);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftNumber !== null && rightNumber === null) return -1;
  if (leftNumber === null && rightNumber !== null) return 1;
  const leftDate = Date.parse(chapterDate(left.attributes ?? {}) ?? "");
  const rightDate = Date.parse(chapterDate(right.attributes ?? {}) ?? "");
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) return leftDate - rightDate;
  return String(left.id).localeCompare(String(right.id));
}

function isDisplayableChapter(item: JsonObject): boolean {
  const attributes = item.attributes;
  return typeof item.id === "string"
    && attributes?.isUnavailable !== true
    && ((typeof attributes?.externalUrl === "string" && attributes.externalUrl.startsWith("https://"))
      || (typeof attributes?.pages === "number" && attributes.pages > 0));
}

async function chapterFeed(mangaId: string, language: string) {
  const chapters: JsonObject[] = [];
  let offset = 0;
  for (let request = 0; request < 20; request += 1) {
    const parameters: Record<string, string | number | undefined> = {
      limit: CHAPTER_BATCH,
      offset,
    };
    parameters["translatedLanguage[]"] = language;
    Object.assign(parameters, {
      // External chapters use their publisher's reader and are opened in the
      // browser; image-hosted chapters remain available in Mekuri's reader.
      includeExternalUrl: 1,
      includeEmptyPages: 1,
      includeFuturePublishAt: 0,
      "order[volume]": "asc",
      "order[chapter]": "asc",
    });
    const value = await getJson<JsonObject>(`/manga/${encodeURIComponent(mangaId)}/feed?${query(parameters)}`);
    if (!Array.isArray(value.data)) throw new Error("MangaDex returned an invalid chapter list.");
    chapters.push(...value.data);
    offset += value.data.length;
    const total = typeof value.total === "number" ? value.total : offset;
    if (!value.data.length || offset >= total || value.data.length < CHAPTER_BATCH) break;
  }
  return chapters.filter(isDisplayableChapter);
}

async function aggregateChapterIds(mangaId: string, language: string): Promise<string[]> {
  const value = await getJson<JsonObject>(`/manga/${encodeURIComponent(mangaId)}/aggregate?${query({ "translatedLanguage[]": language, includeUnavailable: 0 })}`);
  if (!value.volumes || typeof value.volumes !== "object") {
    throw new Error("MangaDex returned an invalid chapter aggregate.");
  }
  const ids = new Set<string>();
  for (const volume of Object.values(value.volumes as Record<string, JsonObject>)) {
    const chapters = volume?.chapters;
    if (!chapters || typeof chapters !== "object") continue;
    for (const chapter of Object.values(chapters as Record<string, JsonObject>)) {
      if (typeof chapter?.id === "string" && chapter.id) ids.add(chapter.id);
    }
  }
  return [...ids].slice(0, 2_000);
}

async function chaptersById(ids: string[]): Promise<JsonObject[]> {
  const chapters: JsonObject[] = [];
  for (let offset = 0; offset < ids.length; offset += CHAPTER_BATCH) {
    const batch = ids.slice(offset, offset + CHAPTER_BATCH);
    const idQuery = batch.map((id) => `ids%5B%5D=${encodeURIComponent(id)}`).join("&");
    const value = await getJson<JsonObject>(`/chapter?limit=${batch.length}&${idQuery}`);
    if (!Array.isArray(value.data)) throw new Error("MangaDex returned an invalid chapter batch.");
    chapters.push(...value.data);
  }
  return chapters.filter(isDisplayableChapter);
}

async function chaptersFor(mangaId: string) {
  const language = selectedLanguage();
  let chapters = await chapterFeed(mangaId, language);
  // MangaDex's title feed can be empty even while the official aggregate has
  // readable chapter IDs. Resolve those IDs in batches as a narrow fallback.
  if (!chapters.length) {
    const ids = await aggregateChapterIds(mangaId, language);
    if (ids.length) chapters = await chaptersById(ids);
  }
  chapters.sort(compareChapters);
  return chapters
    .map((item, index) => ({ ...chapterValue(item), order: index }));
}

function safeBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("https://") || value.includes("?")) {
    throw new Error("MangaDex returned an invalid image delivery host.");
  }
  return value.replace(/\/$/, "");
}

async function pagesFor(chapterId: string) {
  const value = await getJson<JsonObject>(`/at-home/server/${encodeURIComponent(chapterId)}`);
  const base = safeBaseUrl(value.baseUrl);
  const chapter = value.chapter;
  const hash = chapter?.hash;
  const files = chapter?.dataSaver;
  if (typeof hash !== "string" || !Array.isArray(files) || files.length === 0 || files.length > 500) {
    throw new Error("MangaDex returned an invalid chapter page list.");
  }
  return files.map((file: unknown, index: number) => {
    if (typeof file !== "string" || !file || file.includes("/") || file.includes("\\")) {
      throw new Error("MangaDex returned an invalid page filename.");
    }
    return {
      index,
      imageUrl: `${base}/data-saver/${encodeURIComponent(hash)}/${encodeURIComponent(file)}`,
      width: null,
      height: null,
      referer: null,
    };
  });
}

globalThis.source = {
  getPopular({ page = 1 }: { page?: number }) {
    return listManga(Math.max(1, Math.floor(page)));
  },
  getLatest({ page = 1 }: { page?: number }) {
    return listManga(Math.max(1, Math.floor(page)), undefined, "latest");
  },
  search({ query: searchText = "", page = 1 }: { query?: string; page?: number }) {
    const normalized = searchText.trim();
    return listManga(Math.max(1, Math.floor(page)), normalized || undefined);
  },
  async getManga({ mangaId }: { mangaId: string }) {
    if (!mangaId) throw new Error("A manga ID is required.");
    const value = await getJson<JsonObject>(`/manga/${encodeURIComponent(mangaId)}?${query({ "includes[]": "cover_art" })}&${query({ "includes[]": "author" })}&${query({ "includes[]": "artist" })}`);
    if (!value.data) throw new Error("MangaDex did not return that manga.");
    return detail(value.data);
  },
  getChapters({ mangaId }: { mangaId: string }) {
    if (!mangaId) throw new Error("A manga ID is required.");
    return chaptersFor(mangaId);
  },
  getPages({ chapterId }: { chapterId: string }) {
    if (!chapterId) throw new Error("A chapter ID is required.");
    return pagesFor(chapterId);
  },
};

mekuri.log("MangaDex source loaded");
