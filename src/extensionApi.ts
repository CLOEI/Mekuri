import { invoke } from "@tauri-apps/api/core";

export type ContentRating = "safe" | "teen" | "mature" | "unknown";

export interface ExtensionLanguage {
  code: string;
  label: string;
}

export interface ExtensionManifest {
  formatVersion: number;
  id: string;
  name: string;
  version: string;
  hostApiVersion: string;
  entry: string;
  description?: string;
  author?: string;
  icon?: string;
  language: string;
  languages?: ExtensionLanguage[];
  contentRating: ContentRating;
  requestedHosts: string[];
}

export interface InstalledExtension extends ExtensionManifest {
  extensionId: string;
  enabled: boolean;
  trustStatus: string;
  activeVersionDir: string;
}

export interface StagedExtension {
  stagingId: string;
  manifest: ExtensionManifest;
  isUpdate: boolean;
  currentVersion?: string;
  trustStatus: string;
}

export interface SourceManga {
  id: string;
  title: string;
  coverUrl: string | null;
  publicationStatus: string | null;
  contentRating: string | null;
}

export interface MangaPage {
  items: SourceManga[];
  page: number;
  hasNextPage: boolean;
}

export interface MangaDetails {
  id: string;
  title: string;
  coverUrl: string | null;
  description: string | null;
  authors: string[] | null;
  artists: string[] | null;
  genres: string[] | null;
  publicationStatus: string | null;
  contentRating: string | null;
}

export interface Chapter {
  id: string;
  title: string;
  number: number | null;
  volume: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  order: number;
}

export interface PageReference {
  index: number;
  imageUrl: string;
  width: number | null;
  height: number | null;
  referer: string | null;
}

export async function listExtensions() { return invoke<InstalledExtension[]>("list_extensions"); }
export async function inspectExtension(archive: number[]) { return invoke<StagedExtension>("inspect_extension", { archive }); }
export async function installStagedExtension(stagingId: string, acknowledgeUnsigned: boolean, language?: string) { return invoke<InstalledExtension>("install_staged_extension", { stagingId, acknowledgeUnsigned, language }); }
export async function setExtensionEnabled(extensionId: string, enabled: boolean) { return invoke<InstalledExtension>("set_extension_enabled", { extensionId, enabled }); }
export async function setExtensionLanguage(extensionId: string, language: string) { return invoke<InstalledExtension>("set_extension_language", { extensionId, language }); }
export async function uninstallExtension(extensionId: string, removeData: boolean) { return invoke<void>("uninstall_extension", { extensionId, removeData }); }

export async function sourceCall<T>(extensionId: string, operation: string, argument: unknown) {
  return invoke<T>("source_call", { extensionId, operation, argument });
}

export async function fetchExtensionImage(extensionId: string, imageUrl: string, referer?: string | null) {
  const resourceId = await invoke<string>("fetch_extension_image", { extensionId, imageUrl, referer: referer ?? null });
  // Tauri exposes registered URI schemes as http://<scheme>.localhost on
  // Windows and Android. Other platforms use the scheme URL directly.
  const usesHttpScheme = /Windows|Android/i.test(navigator.userAgent);
  return usesHttpScheme
    ? `http://mekuri.localhost/image/${resourceId}`
    : `mekuri://localhost/image/${resourceId}`;
}
