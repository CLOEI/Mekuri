# Mekuri source extensions

Mekuri extensions are ordinary ZIP archives named `.mekuri-ext`. They are not native plugins and do not run in the React/Tauri JavaScript context. Mekuri evaluates `source.js` in an embedded QuickJS runtime that has no Node APIs, filesystem, shell, native modules, sockets, or unrestricted imports. This is capability-limited execution, not an operating-system security boundary: users should install only packages they trust.

## Package layout

```text
manifest.json
source.js
icon.png                 # optional, PNG/JPEG/WebP/safe SVG
assets/                  # optional explicitly supported static files
```

Authoring projects may use TypeScript and imports. The packaging command bundles the entry module and emits `source.js`; only the manifest, bundled source, optional icon, and `assets/` are included.

## Manifest v1

```json
{
  "formatVersion": 1,
  "id": "com.example.source",
  "name": "Example Source",
  "version": "1.0.0",
  "hostApiVersion": "1.0",
  "entry": "source.ts",
  "description": "Optional description",
  "author": "Self-declared author",
  "icon": "icon.png",
  "language": "en",
  "contentRating": "safe",
  "requestedHosts": ["https://example.com/"]
}
```

`formatVersion` describes the package container and schema. `version` is the extension release and is compared with semantic versioning for updates. `hostApiVersion` is the Mekuri runtime contract. v1 packages provide one source.

## Source contract

The entry module must assign `globalThis.source` with these functions. Arguments are objects and return promises or values. IDs are stable source-specific strings; titles and chapter numbers are not identities.

```ts
getPopular({ page }): Promise<PaginatedManga>
search({ query, page }): Promise<PaginatedManga>
getManga({ mangaId }): Promise<MangaDetails>
getChapters({ mangaId }): Promise<Chapter[]>
getPages({ chapterId }): Promise<PageReference[]>
```

Returned fields must use `null` when unknown. `PaginatedManga` contains `{ items, page, hasNextPage }`. A `MangaSummary` has `id`, `title`, nullable `coverUrl`, `publicationStatus`, and `contentRating`. A `Chapter` has `id`, `title`, nullable `number`, `volume`, `publishedAt`, a nullable HTTPS `externalUrl` for an official off-site reader, and explicit numeric `order`. A `PageReference` has `index`, `imageUrl`, nullable dimensions, and an optional `referer`.

## Host API and permissions

`mekuri.http.get(url)` is the only network operation. Every HTTPS origin must be declared in `requestedHosts`; a permission may use one leftmost `*.` label for a deliberately scoped subdomain family. Redirects are checked against the same permissions on every hop. Mekuri rejects loopback, private, link-local, and unresolved destinations, keeps TLS verification enabled, bounds responses and concurrency, and returns structured errors such as `permission-denied`, `rate-limit`, `timeout`, `network-failure`, and `invalid-result`.

`mekuri.parseHtml(html, selector)` returns a JSON string containing bounded `{ text, html }` matches. `mekuri.log(message)` is sanitized and capped. There is intentionally no browser DOM, Node.js, cookie API, filesystem, shell, or arbitrary module loader. Source-scoped session/cookies are held by Rust rather than exposed to the script.

`mekuri.settings.get(key)` and `mekuri.settings.set(key, value)` provide a source-scoped string key/value store. Keys are capped at 128 bytes and values at 32 KiB; the store is removed only when the user explicitly requests settings/session-data removal during uninstall.

## Build, import, debug

From the repository root:

```bash
bun run package:extension extensions/demo
```

Then open Mekuri → Browse → Extensions → Choose `.mekuri-ext`. Packages are inspected without executing JavaScript. Review the requested hosts and explicitly trust the unsigned package before installation. The demo package is never auto-installed and uses local deterministic SVG data pages. Runtime logs are sanitized and written by the Rust process; parser and source behavior should be tested with small fixtures.
