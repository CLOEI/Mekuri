import { expect, test } from "bun:test";

const responses = new Map<string, string>();
const settings = new Map<string, string>([["language", "en"]]);
(globalThis as any).mekuri = {
  http: {
    get: async (url: string) => {
      for (const [suffix, response] of responses) if (url.endsWith(suffix)) return response;
      throw new Error(`Unexpected fixture URL: ${url}`);
    },
  },
  settings: { get: (key: string) => settings.get(key) ?? null },
  log: () => undefined,
};

await import("./source.ts");
const source = (globalThis as any).source;

test("maps MangaDex manga metadata without inventing unknown fields", async () => {
  responses.set("/manga?limit=24&offset=0&includes%5B%5D=cover_art&order%5BfollowedCount%5D=desc", JSON.stringify({
    total: 1,
    data: [{
      id: "manga-1",
      attributes: { title: { en: "Fixture Title" }, status: "ongoing", contentRating: "safe" },
      relationships: [{ type: "cover_art", attributes: { fileName: "cover.jpg" } }],
    }],
  }));

  const result = await source.getPopular({ page: 1 });
  expect(result).toEqual({
    items: [{
      id: "manga-1",
      title: "Fixture Title",
      coverUrl: "https://uploads.mangadex.org/covers/manga-1/cover.jpg.256.jpg",
      publicationStatus: "ongoing",
      contentRating: "safe",
    }],
    page: 1,
    hasNextPage: false,
  });
});

test("requests the MangaDex latest-updated catalogue order", async () => {
  responses.set("/manga?limit=24&offset=0&includes%5B%5D=cover_art&order%5BlatestUploadedChapter%5D=desc", JSON.stringify({ total: 0, data: [] }));
  await expect(source.getLatest({ page: 1 })).resolves.toEqual({ items: [], page: 1, hasNextPage: false });
});

test("keeps MangaDex data-saver page order", async () => {
  responses.set("/at-home/server/chapter-1", JSON.stringify({
    baseUrl: "https://uploads.mangadex.org",
    chapter: { hash: "hash-1", dataSaver: ["2-page.jpg", "1-page.jpg"] },
  }));

  const result = await source.getPages({ chapterId: "chapter-1" });
  expect(result.map((page: any) => page.imageUrl)).toEqual([
    "https://uploads.mangadex.org/data-saver/hash-1/2-page.jpg",
    "https://uploads.mangadex.org/data-saver/hash-1/1-page.jpg",
  ]);
  expect(result.map((page: any) => page.index)).toEqual([0, 1]);
});

test("keeps externally hosted chapters as official links", async () => {
  responses.set("/manga/manga-1/feed?limit=100&offset=0&translatedLanguage%5B%5D=en&includeExternalUrl=1&includeEmptyPages=1&includeFuturePublishAt=0&order%5Bvolume%5D=asc&order%5Bchapter%5D=asc", JSON.stringify({
    total: 3,
    data: [
      { id: "chapter-1", attributes: { chapter: "1", pages: 12, publishAt: "2026-01-01T00:00:00Z" } },
      { id: "empty-chapter", attributes: { chapter: "2", pages: 0, publishAt: "2026-01-02T00:00:00Z" } },
      { id: "official-chapter", attributes: { chapter: "3", pages: 0, externalUrl: "https://publisher.example/chapter-3", publishAt: "2026-01-03T00:00:00Z" } },
    ],
  }));

  const result = await source.getChapters({ mangaId: "manga-1" });
  expect(result).toEqual([{
    id: "chapter-1",
    title: "Chapter 1",
    number: 1,
    volume: null,
    publishedAt: "2026-01-01T00:00:00Z",
    externalUrl: null,
    order: 0,
  }, {
    id: "official-chapter",
    title: "Chapter 3",
    number: 3,
    volume: null,
    publishedAt: "2026-01-03T00:00:00Z",
    externalUrl: "https://publisher.example/chapter-3",
    order: 1,
  }]);
});

test("uses the selected installed language for chapter requests", async () => {
  settings.set("language", "id");
  responses.set("/manga/manga-id/feed?limit=100&offset=0&translatedLanguage%5B%5D=id&includeExternalUrl=1&includeEmptyPages=1&includeFuturePublishAt=0&order%5Bvolume%5D=asc&order%5Bchapter%5D=asc", JSON.stringify({ total: 0, data: [] }));
  responses.set("/manga/manga-id/aggregate?translatedLanguage%5B%5D=id&includeUnavailable=0", JSON.stringify({ volumes: {} }));
  await expect(source.getChapters({ mangaId: "manga-id" })).resolves.toEqual([]);
  settings.set("language", "en");
});

test("falls back to aggregate chapter IDs when the English feed is empty", async () => {
  responses.set("/manga/manga-fallback/feed?limit=100&offset=0&translatedLanguage%5B%5D=en&includeExternalUrl=1&includeEmptyPages=1&includeFuturePublishAt=0&order%5Bvolume%5D=asc&order%5Bchapter%5D=asc", JSON.stringify({ total: 0, data: [] }));
  responses.set("/manga/manga-fallback/aggregate?translatedLanguage%5B%5D=en&includeUnavailable=0", JSON.stringify({
    volumes: { "1": { chapters: { "1": { id: "chapter-fallback" } } } },
  }));
  responses.set("/chapter?limit=1&ids%5B%5D=chapter-fallback", JSON.stringify({
    data: [{ id: "chapter-fallback", attributes: { chapter: "1", pages: 8, publishedAt: "2026-01-03T00:00:00Z" } }],
  }));

  const result = await source.getChapters({ mangaId: "manga-fallback" });
  expect(result.map((chapter: any) => chapter.id)).toEqual(["chapter-fallback"]);
});
