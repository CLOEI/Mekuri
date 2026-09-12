# MangaDex example extension

This is a separately packaged MangaDex source for Mekuri. It is not bundled
with the application and is not auto-installed.

## Build and import

From the repository root:

```bash
bun run package:extension extensions/mangadex
```

The command produces `extensions/org.mekuri.mangadex-1.1.1.mekuri-ext`.
Import that file from Browse → Extensions, review the requested hosts, and
explicitly acknowledge the unsigned-package warning before installing it.

## API behavior

The extension uses the public MangaDex API for popular titles, title search,
manga metadata, and the English chapter feed. Chapter pages use MangaDex's
`/at-home/server/{chapterId}` response and the documented `data-saver` image
URLs, preserving the order returned by MangaDex.

The package requests `api.mangadex.org`, the standard
`uploads.mangadex.org` image host, and the explicitly scoped
`*.mangadex.network` @Home host pattern. MangaDex can assign a geographically
optimized @Home base URL; this pattern permits only subdomains of the
MangaDex-owned network domain. Hosts outside those declared permissions are
still rejected by Mekuri rather than silently widening the package's access.

MangaDex's API documentation says that @Home base URLs are time-limited and
must be used as returned, and that clients should not send authentication
headers to image servers. This package uses the returned URL and does not
request or expose MangaDex credentials.
