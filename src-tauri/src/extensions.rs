//! Mekuri's importable source-extension runtime.
//!
//! The extension runtime is capability limited, not an operating-system
//! security boundary. A package is still executable code and should only be
//! installed when the user trusts its author and requested permissions.

use reqwest::header::{HeaderMap, HeaderValue, REFERER, USER_AGENT};
use rquickjs::{
    function::Async, AsyncContext, AsyncRuntime, CatchResultExt, CaughtError, FromJs, Function,
    Object, Promise, Value as JsValue,
};
use scraper::{Html, Selector};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Cursor, Read},
    net::IpAddr,
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime},
};
use tokio::{net::lookup_host, sync::Semaphore, time::timeout};
use tokio_util::sync::CancellationToken;
use url::Url;
use uuid::Uuid;
use zip::ZipArchive;

pub const HOST_API_VERSION: &str = "1.0";
const MAX_ARCHIVE_SIZE: usize = 32 * 1024 * 1024;
const MAX_UNCOMPRESSED_SIZE: u64 = 128 * 1024 * 1024;
const MAX_FILE_SIZE: u64 = 16 * 1024 * 1024;
const MAX_FILES: usize = 512;
const MAX_HTTP_BODY: usize = 4 * 1024 * 1024;
const MAX_RESULT_SIZE: usize = 2 * 1024 * 1024;
const STAGING_TTL: Duration = Duration::from_secs(30 * 60);
type HostLimiters = Arc<tokio::sync::Mutex<HashMap<String, Arc<Semaphore>>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub format_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub host_api_version: String,
    pub entry: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub icon: Option<String>,
    pub language: String,
    pub languages: Option<Vec<LanguageOption>>,
    pub content_rating: ContentRating,
    pub requested_hosts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LanguageOption {
    pub code: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentRating {
    Safe,
    Teen,
    Mature,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledExtension {
    pub extension_id: String,
    pub name: String,
    pub version: String,
    pub host_api_version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub language: String,
    pub content_rating: ContentRating,
    pub requested_hosts: Vec<String>,
    pub enabled: bool,
    pub trust_status: String,
    pub active_version_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedExtension {
    pub staging_id: String,
    pub manifest: Manifest,
    pub is_update: bool,
    pub current_version: Option<String>,
    pub trust_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceError {
    pub code: String,
    pub message: String,
}

impl SourceError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for SourceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for SourceError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaSummary {
    pub id: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub publication_status: Option<String>,
    pub content_rating: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaPage {
    pub items: Vec<MangaSummary>,
    pub page: u32,
    pub has_next_page: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaDetails {
    pub id: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub description: Option<String>,
    pub authors: Option<Vec<String>>,
    pub artists: Option<Vec<String>>,
    pub genres: Option<Vec<String>>,
    pub publication_status: Option<String>,
    pub content_rating: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub number: Option<f64>,
    pub volume: Option<String>,
    pub published_at: Option<String>,
    pub external_url: Option<String>,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageReference {
    pub index: u32,
    pub image_url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub referer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Registry {
    extensions: Vec<InstalledExtension>,
}

#[derive(Debug, Clone)]
struct StageRecord {
    path: PathBuf,
    manifest: Manifest,
    created: SystemTime,
}

pub struct ExtensionManager {
    root: PathBuf,
    registry_path: PathBuf,
    registry: Registry,
    stages: HashMap<String, StageRecord>,
    active_work: HashMap<String, Vec<CancellationToken>>,
    sessions: HashMap<String, reqwest::Client>,
    host_slots: HostLimiters,
}

pub struct AppState {
    pub manager: Arc<tokio::sync::Mutex<ExtensionManager>>,
}

impl ExtensionManager {
    pub fn open(app_data_dir: PathBuf) -> Result<Self, SourceError> {
        let root = app_data_dir.join("extensions");
        fs::create_dir_all(root.join("staging")).map_err(io_error)?;
        fs::create_dir_all(root.join("installed")).map_err(io_error)?;
        fs::create_dir_all(root.join("image-cache")).map_err(io_error)?;
        let registry_path = root.join("registry.json");
        let registry = if registry_path.exists() {
            let bytes = fs::read(&registry_path).map_err(io_error)?;
            serde_json::from_slice(&bytes).unwrap_or(Registry { extensions: vec![] })
        } else {
            Registry { extensions: vec![] }
        };
        cleanup_old_staging(&root.join("staging"));
        build_http_client()?;
        Ok(Self {
            root,
            registry_path,
            registry,
            stages: HashMap::new(),
            active_work: HashMap::new(),
            sessions: HashMap::new(),
            host_slots: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        })
    }

    pub fn list(&self) -> Vec<InstalledExtension> {
        self.registry.extensions.clone()
    }

    fn session_for(&mut self, extension_id: &str) -> Result<reqwest::Client, SourceError> {
        if let Some(client) = self.sessions.get(extension_id) {
            return Ok(client.clone());
        }
        let client = build_http_client()?;
        self.sessions
            .insert(extension_id.to_string(), client.clone());
        Ok(client)
    }

    pub fn inspect(&mut self, archive: Vec<u8>) -> Result<StagedExtension, SourceError> {
        self.stages
            .retain(|_, stage| stage.created.elapsed().unwrap_or_default() < STAGING_TTL);
        if archive.len() < 4 || archive.len() > MAX_ARCHIVE_SIZE || &archive[..2] != b"PK" {
            return Err(SourceError::new(
                "invalid-package",
                "The file is not a supported ZIP package or is too large.",
            ));
        }
        let mut zip = ZipArchive::new(Cursor::new(&archive)).map_err(|_| {
            SourceError::new(
                "invalid-package",
                "The package is not a readable ZIP archive.",
            )
        })?;
        if zip.len() == 0 || zip.len() > MAX_FILES {
            return Err(SourceError::new(
                "invalid-package",
                "The package contains an unsupported number of files.",
            ));
        }
        let mut names = HashSet::new();
        let mut total = 0u64;
        for index in 0..zip.len() {
            let entry = zip.by_index(index).map_err(|_| {
                SourceError::new("invalid-package", "The archive contains a malformed entry.")
            })?;
            let name = safe_archive_path(entry.name())?;
            if !names.insert(name.to_lowercase()) {
                return Err(SourceError::new(
                    "invalid-package",
                    "The package contains duplicate paths after Windows normalization.",
                ));
            }
            if entry
                .unix_mode()
                .map(|mode| mode & 0o170000 == 0o120000)
                .unwrap_or(false)
            {
                return Err(SourceError::new(
                    "invalid-package",
                    "Symbolic links are not allowed in extension packages.",
                ));
            }
            if entry.size() > MAX_FILE_SIZE {
                return Err(SourceError::new(
                    "invalid-package",
                    "A package file exceeds the per-file size limit.",
                ));
            }
            total = total.checked_add(entry.size()).ok_or_else(|| {
                SourceError::new(
                    "invalid-package",
                    "The decompressed package size is invalid.",
                )
            })?;
            if total > MAX_UNCOMPRESSED_SIZE {
                return Err(SourceError::new(
                    "invalid-package",
                    "The decompressed package is too large.",
                ));
            }
            if is_native_payload(&name) {
                return Err(SourceError::new(
                    "unsupported-payload",
                    "Native and executable payloads are not supported.",
                ));
            }
        }
        let manifest_index = find_zip_entry(&mut zip, "manifest.json")?;
        let mut manifest_bytes = Vec::new();
        zip.by_index(manifest_index)
            .map_err(|_| SourceError::new("invalid-package", "manifest.json is unreadable."))?
            .read_to_end(&mut manifest_bytes)
            .map_err(io_error)?;
        let manifest: Manifest = serde_json::from_slice(&manifest_bytes).map_err(|e| {
            SourceError::new("invalid-manifest", format!("manifest.json is invalid: {e}"))
        })?;
        validate_manifest(&manifest, &names)?;
        let entry_path = manifest.entry.to_lowercase();
        if !names.contains(&entry_path) {
            return Err(SourceError::new(
                "invalid-manifest",
                "The manifest entry file does not exist in the package.",
            ));
        }
        if manifest.icon.is_some() {
            validate_icon(&mut zip, manifest.icon.as_deref().unwrap())?;
        }

        let staging_id = Uuid::new_v4().simple().to_string();
        let stage_root = self.root.join("staging").join(&staging_id);
        fs::create_dir_all(&stage_root).map_err(io_error)?;
        let result = (|| {
            for index in 0..zip.len() {
                let mut entry = zip.by_index(index).map_err(|_| {
                    SourceError::new("invalid-package", "The archive contains a malformed entry.")
                })?;
                let relative = safe_archive_path(entry.name())?;
                let destination = stage_root.join(Path::new(&relative));
                if entry.is_dir() {
                    fs::create_dir_all(&destination).map_err(io_error)?;
                    continue;
                }
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(io_error)?;
                }
                let mut output = File::create(&destination).map_err(io_error)?;
                std::io::copy(&mut entry, &mut output).map_err(io_error)?;
            }
            Ok::<(), SourceError>(())
        })();
        if let Err(error) = result {
            let _ = fs::remove_dir_all(&stage_root);
            return Err(error);
        }
        self.stages.insert(
            staging_id.clone(),
            StageRecord {
                path: stage_root,
                manifest: manifest.clone(),
                created: SystemTime::now(),
            },
        );
        let current_version = self
            .registry
            .extensions
            .iter()
            .find(|item| item.extension_id == manifest.id)
            .map(|item| item.version.clone());
        Ok(StagedExtension {
            staging_id,
            manifest,
            is_update: current_version.is_some(),
            current_version,
            trust_status: "unsigned — user-trusted package".into(),
        })
    }

    pub fn install(
        &mut self,
        staging_id: &str,
        acknowledge_unsigned: bool,
        selected_language: Option<String>,
    ) -> Result<InstalledExtension, SourceError> {
        if !acknowledge_unsigned {
            return Err(SourceError::new(
                "trust-required",
                "Unsigned packages require explicit trust acknowledgment.",
            ));
        }
        let stage = self.stages.remove(staging_id).ok_or_else(|| {
            SourceError::new(
                "staging-expired",
                "This package review has expired. Import it again.",
            )
        })?;
        let existing = self
            .registry
            .extensions
            .iter()
            .position(|item| item.extension_id == stage.manifest.id);
        let old_entry = existing.map(|index| self.registry.extensions[index].clone());
        let requested_language = selected_language
            .clone()
            .or_else(|| old_entry.as_ref().map(|item| item.language.clone()))
            .unwrap_or_else(|| stage.manifest.language.clone());
        let supported_languages = stage.manifest.languages.as_deref().unwrap_or(&[]);
        let language = if supported_languages.is_empty() {
            if requested_language != stage.manifest.language {
                return Err(SourceError::new("invalid-language", "This extension does not support the selected language."));
            }
            stage.manifest.language.clone()
        } else if supported_languages.iter().any(|option| option.code == requested_language) {
            requested_language
        } else if selected_language.is_some() {
            return Err(SourceError::new("invalid-language", "The selected language is not declared by this extension."));
        } else {
            stage.manifest.language.clone()
        };
        if let Some(index) = existing {
            let old = Version::parse(&self.registry.extensions[index].version).unwrap();
            let new = Version::parse(&stage.manifest.version).unwrap();
            if new <= old {
                return Err(SourceError::new(
                    "version-conflict",
                    "Downgrades and equal-version replacements are not accepted.",
                ));
            }
            self.cancel(&stage.manifest.id);
        }
        let internal = internal_id(&stage.manifest.id);
        let version_dir = self
            .root
            .join("installed")
            .join(&internal)
            .join("versions")
            .join(format!(
                "{}-{}",
                stage.manifest.version,
                Uuid::new_v4().simple()
            ));
        if let Some(parent) = version_dir.parent() {
            fs::create_dir_all(parent).map_err(io_error)?;
        }
        if let Err(error) = fs::rename(&stage.path, &version_dir) {
            let _ = fs::remove_dir_all(&stage.path);
            return Err(io_error(error));
        }
        let installed = InstalledExtension {
            extension_id: stage.manifest.id.clone(),
            name: stage.manifest.name.clone(),
            version: stage.manifest.version.clone(),
            host_api_version: stage.manifest.host_api_version.clone(),
            description: stage.manifest.description.clone(),
            author: stage.manifest.author.clone(),
            language: language.clone(),
            content_rating: stage.manifest.content_rating.clone(),
            requested_hosts: stage.manifest.requested_hosts.clone(),
            enabled: old_entry.as_ref().map(|item| item.enabled).unwrap_or(true),
            trust_status: "unsigned — user-trusted package".into(),
            active_version_dir: version_dir.to_string_lossy().into_owned(),
        };
        persist_setting(&self.root.join("settings").join(&stage.manifest.id), "language", &language)?;
        let previous_registry = self.registry.clone();
        if let Some(index) = existing {
            self.registry.extensions[index] = installed.clone();
        } else {
            self.registry.extensions.push(installed.clone());
        }
        if let Err(error) = self.persist_registry() {
            self.registry = previous_registry;
            let _ = fs::remove_dir_all(&version_dir);
            return Err(error);
        }
        Ok(installed)
    }

    pub fn set_enabled(
        &mut self,
        extension_id: &str,
        enabled: bool,
    ) -> Result<InstalledExtension, SourceError> {
        let result = {
            let extension = self
                .registry
                .extensions
                .iter_mut()
                .find(|item| item.extension_id == extension_id)
                .ok_or_else(|| SourceError::new("not-found", "Extension is not installed."))?;
            extension.enabled = enabled;
            extension.clone()
        };
        if !enabled {
            self.cancel(extension_id);
        }
        self.persist_registry()?;
        Ok(result)
    }

    pub fn set_language(
        &mut self,
        extension_id: &str,
        language: String,
    ) -> Result<InstalledExtension, SourceError> {
        let (manifest, _) = self.source_path(extension_id)?;
        let valid = manifest.languages.as_deref().map(|options| options.iter().any(|option| option.code == language)).unwrap_or_else(|| manifest.language == language);
        if !valid {
            return Err(SourceError::new("invalid-language", "The selected language is not declared by this extension."));
        }
        let index = self.registry.extensions.iter().position(|item| item.extension_id == extension_id).ok_or_else(|| SourceError::new("not-found", "Extension is not installed."))?;
        let previous_registry = self.registry.clone();
        self.registry.extensions[index].language = language.clone();
        if let Err(error) = self.persist_registry() {
            self.registry = previous_registry;
            return Err(error);
        }
        persist_setting(&self.root.join("settings").join(extension_id), "language", &language)?;
        Ok(self.registry.extensions[index].clone())
    }

    pub fn uninstall(&mut self, extension_id: &str, remove_data: bool) -> Result<(), SourceError> {
        self.cancel(extension_id);
        let index = self
            .registry
            .extensions
            .iter()
            .position(|item| item.extension_id == extension_id)
            .ok_or_else(|| SourceError::new("not-found", "Extension is not installed."))?;
        let internal = internal_id(extension_id);
        let extension_root = self.root.join("installed").join(internal);
        fs::remove_dir_all(&extension_root).map_err(io_error)?;
        if remove_data {
            let _ = fs::remove_dir_all(self.root.join("settings").join(internal_id(extension_id)));
        }
        self.registry.extensions.remove(index);
        self.persist_registry()
    }

    pub fn begin_work(&mut self, extension_id: &str) -> Result<CancellationToken, SourceError> {
        let extension = self
            .registry
            .extensions
            .iter()
            .find(|item| item.extension_id == extension_id)
            .ok_or_else(|| SourceError::new("not-found", "Source is not installed."))?;
        if !extension.enabled {
            return Err(SourceError::new(
                "extension-disabled",
                "This source is disabled.",
            ));
        }
        let token = CancellationToken::new();
        self.active_work
            .entry(extension_id.to_string())
            .or_default()
            .push(token.clone());
        Ok(token)
    }

    pub fn finish_work(&mut self, extension_id: &str, token: &CancellationToken) {
        if let Some(tokens) = self.active_work.get_mut(extension_id) {
            let _ = token;
            tokens.pop();
            if tokens.is_empty() {
                self.active_work.remove(extension_id);
            }
        }
    }

    pub fn cancel(&mut self, extension_id: &str) {
        if let Some(tokens) = self.active_work.remove(extension_id) {
            for token in tokens {
                token.cancel();
            }
        }
    }

    pub fn source_path(&self, extension_id: &str) -> Result<(Manifest, PathBuf), SourceError> {
        let extension = self
            .registry
            .extensions
            .iter()
            .find(|item| item.extension_id == extension_id)
            .ok_or_else(|| SourceError::new("not-found", "Source is not installed."))?;
        if !extension.enabled {
            return Err(SourceError::new(
                "extension-disabled",
                "This source is disabled.",
            ));
        }
        let dir = PathBuf::from(&extension.active_version_dir);
        let root = self.root.join("installed");
        if !dir.starts_with(&root) {
            return Err(SourceError::new(
                "invalid-package",
                "The active extension path is invalid.",
            ));
        }
        let manifest: Manifest =
            serde_json::from_slice(&fs::read(dir.join("manifest.json")).map_err(io_error)?)
                .map_err(|_| {
                    SourceError::new("invalid-manifest", "The installed manifest is unreadable.")
                })?;
        Ok((manifest, dir))
    }

    pub async fn call_source(
        manager: Arc<tokio::sync::Mutex<Self>>,
        extension_id: String,
        operation: String,
        argument: Value,
    ) -> Result<Value, SourceError> {
        let (manifest, dir, token, client, slots, settings_path) = {
            let mut state = manager.lock().await;
            let (manifest, dir) = state.source_path(&extension_id)?;
            let token = state.begin_work(&extension_id)?;
            (
                manifest,
                dir,
                token,
                state.session_for(&extension_id)?,
                state.host_slots.clone(),
                state.root.join("settings").join(&extension_id),
            )
        };
        // QuickJS contexts are intentionally thread-affine. Keep the complete
        // engine lifetime on one blocking worker, while the Tauri command
        // itself remains asynchronous and never blocks the UI thread.
        let worker_token = token.clone();
        let result = tokio::task::spawn_blocking(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| SourceError::new("runtime", e.to_string()))?;
            runtime.block_on(run_javascript(
                manifest,
                dir,
                operation,
                argument,
                client,
                slots,
                worker_token,
                settings_path,
            ))
        })
        .await
        .map_err(|e| SourceError::new("runtime", e.to_string()))?;
        let mut state = manager.lock().await;
        state.finish_work(&extension_id, &token);
        result
    }

    pub async fn fetch_image(
        manager: Arc<tokio::sync::Mutex<Self>>,
        extension_id: String,
        image_url: String,
        referer: Option<String>,
    ) -> Result<String, SourceError> {
        let (manifest, http, slots, root, token) = {
            let mut state = manager.lock().await;
            let (manifest, _) = state.source_path(&extension_id)?;
            let token = state.begin_work(&extension_id)?;
            (
                manifest,
                state.session_for(&extension_id)?,
                state.host_slots.clone(),
                state.root.clone(),
                token,
            )
        };
        let result = async {
            let bytes = if let Some(data) = image_url.strip_prefix("data:image/svg+xml,") {
                let decoded = percent_encoding::percent_decode_str(data)
                    .decode_utf8()
                    .map_err(|_| {
                        SourceError::new("invalid-result", "The inline image is not valid UTF-8.")
                    })?;
                decoded.into_owned().into_bytes()
            } else {
                let url = validate_network_url(&image_url, &manifest.requested_hosts)?;
                fetch_bytes(
                    &http,
                    slots,
                    url,
                    &manifest.requested_hosts,
                    referer.as_deref(),
                    token.clone(),
                )
                .await?
            };
            let id = Uuid::new_v4().simple().to_string();
            let (mime, body) = sniff_image(&bytes)?;
            let path = root.join("image-cache").join(&id);
            fs::write(&path, [mime.as_bytes(), b"\n", &body].concat()).map_err(io_error)?;
            Ok::<String, SourceError>(id)
        }
        .await;
        let mut state = manager.lock().await;
        state.finish_work(&extension_id, &token);
        result
    }

    fn persist_registry(&self) -> Result<(), SourceError> {
        let temp = self.registry_path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(&self.registry)
            .map_err(|e| SourceError::new("storage", e.to_string()))?;
        fs::write(&temp, bytes).map_err(io_error)?;
        fs::rename(temp, &self.registry_path).map_err(io_error)
    }
}

async fn run_javascript(
    manifest: Manifest,
    directory: PathBuf,
    operation: String,
    argument: Value,
    client: reqwest::Client,
    slots: HostLimiters,
    token: CancellationToken,
    settings_path: PathBuf,
) -> Result<Value, SourceError> {
    let source = fs::read_to_string(directory.join(&manifest.entry)).map_err(io_error)?;
    let runtime = AsyncRuntime::new().map_err(|e| SourceError::new("runtime", e.to_string()))?;
    runtime.set_memory_limit(32 * 1024 * 1024).await;
    runtime.set_max_stack_size(512 * 1024).await;
    let deadline = Instant::now() + Duration::from_secs(12);
    let interrupt_token = token.clone();
    runtime
        .set_interrupt_handler(Some(Box::new(move || {
            Instant::now() >= deadline || interrupt_token.is_cancelled()
        })))
        .await;
    let context = AsyncContext::full(&runtime)
        .await
        .map_err(|e| SourceError::new("runtime", e.to_string()))?;
    let operation_json = serde_json::to_string(&operation).unwrap();
    let argument_json = serde_json::to_string(&argument).unwrap();
    let result_token = token.clone();
    let settings = load_settings(&settings_path);
    let result = timeout(Duration::from_secs(15), context.async_with(async move |ctx| {
        let root = Object::new(ctx.clone()).map_err(|e| rquickjs::Error::new_from_js_message("runtime", "object", e.to_string()))?;
        let http = Object::new(ctx.clone()).map_err(|e| rquickjs::Error::new_from_js_message("runtime", "object", e.to_string()))?;
        let hosts = manifest.requested_hosts.clone();
        let http_token = token.clone();
        let get = Function::new(ctx.clone(), Async(move |url: String| {
            let client = client.clone(); let slots = slots.clone(); let hosts = hosts.clone(); let token = http_token.clone();
            async move {
                let checked = validate_network_url(&url, &hosts).map_err(|e| rquickjs::Error::new_from_js_message("url", "string", e.to_string()))?;
                let body = fetch_bytes(&client, slots, checked, &hosts, None, token).await.map_err(|e| rquickjs::Error::new_from_js_message("http", "response", e.to_string()))?;
                String::from_utf8(body).map_err(|e| rquickjs::Error::new_from_js_message("http", "utf8", e.to_string()))
            }
        }))?;
        http.set("get", get)?;
        root.set("http", http)?;
        let parser = Function::new(ctx.clone(), |html: String, selector: String| -> Result<String, rquickjs::Error> {
            let selector = Selector::parse(&selector).map_err(|e| rquickjs::Error::new_from_js_message("selector", "valid CSS selector", e.to_string()))?;
            let document = Html::parse_document(&html);
            let values: Vec<Value> = document.select(&selector).take(500).map(|node| json!({ "text": node.text().collect::<String>().trim(), "html": node.inner_html() })).collect();
            serde_json::to_string(&values).map_err(|e| rquickjs::Error::new_from_js_message("parser", "json", e.to_string()))
        })?;
        root.set("parseHtml", parser)?;
        let settings_object = Object::new(ctx.clone())?;
        let settings_for_get = settings.clone();
        let get_setting = Function::new(ctx.clone(), move |key: String| -> Result<Option<String>, rquickjs::Error> {
            if key.len() > 128 { return Err(rquickjs::Error::new_from_js_message("settings", "key", "setting key is too long")); }
            Ok(settings_for_get.lock().ok().and_then(|values| values.get(&key).cloned()))
        })?;
        let settings_for_set = settings.clone();
        let settings_file = settings_path.clone();
        let set_setting = Function::new(ctx.clone(), move |key: String, value: String| -> Result<(), rquickjs::Error> {
            if key.is_empty() || key.len() > 128 || value.len() > 32 * 1024 { return Err(rquickjs::Error::new_from_js_message("settings", "value", "setting key or value is too large")); }
            let mut values = settings_for_set.lock().map_err(|_| rquickjs::Error::new_from_js_message("settings", "store", "settings are unavailable"))?;
            values.insert(key, value);
            std::fs::create_dir_all(&settings_file).map_err(|error| rquickjs::Error::new_from_js_message("settings", "storage", error.to_string()))?;
            let bytes = serde_json::to_vec(&*values).map_err(|error| rquickjs::Error::new_from_js_message("settings", "storage", error.to_string()))?;
            std::fs::write(settings_file.join("values.json"), bytes).map_err(|error| rquickjs::Error::new_from_js_message("settings", "storage", error.to_string()))?;
            Ok(())
        })?;
        settings_object.set("get", get_setting)?;
        settings_object.set("set", set_setting)?;
        root.set("settings", settings_object)?;
        let log = Function::new(ctx.clone(), |message: String| { let safe = message.chars().take(500).collect::<String>(); eprintln!("[mekuri-extension] {safe}"); })?;
        root.set("log", log)?;
        ctx.globals().set("mekuri", root)?;
        ctx.eval::<(), _>(source)?;
        let script = format!("(async () => {{ if (!globalThis.source || typeof globalThis.source[{operation_json}] !== 'function') throw new Error('Missing source operation'); const value = await globalThis.source[{operation_json}]({argument_json}); return JSON.stringify(value); }})() ");
        let promise: Promise = ctx.eval(script)?;
        let value = promise.into_future::<JsValue>().await.catch(&ctx).map_err(|error| {
            let message = match error {
                CaughtError::Exception(exception) => exception
                    .message()
                    .unwrap_or_else(|| "The extension raised a JavaScript error.".into()),
                CaughtError::Value(value) => format!(
                    "The extension rejected its request with an unsupported value: {:?}",
                    value
                ),
                CaughtError::Error(error) => error.to_string(),
            };
            rquickjs::Error::new_from_js_message("extension", "request", message)
        })?;
        String::from_js(&ctx, value)
    })).await.map_err(|_| SourceError::new("timeout", "The extension exceeded its execution deadline."))?;
    let serialized = result.map_err(|error| {
        if result_token.is_cancelled() {
            SourceError::new("cancelled", "The extension request was cancelled.")
        } else {
            SourceError::new("runtime", error.to_string())
        }
    })?;
    if serialized.len() > MAX_RESULT_SIZE {
        return Err(SourceError::new(
            "invalid-result",
            "The extension returned too much data.",
        ));
    }
    let value: Value = serde_json::from_str(&serialized).map_err(|e| {
        SourceError::new(
            "invalid-result",
            format!("The extension returned invalid JSON: {e}"),
        )
    })?;
    validate_operation_result(&operation, &value)?;
    Ok(value)
}

fn load_settings(path: &Path) -> Arc<std::sync::Mutex<HashMap<String, String>>> {
    let values = fs::read(path.join("values.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<HashMap<String, String>>(&bytes).ok())
        .unwrap_or_default();
    Arc::new(std::sync::Mutex::new(values))
}

fn persist_setting(path: &Path, key: &str, value: &str) -> Result<(), SourceError> {
    let mut values = fs::read(path.join("values.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<HashMap<String, String>>(&bytes).ok())
        .unwrap_or_default();
    values.insert(key.to_owned(), value.to_owned());
    fs::create_dir_all(path).map_err(io_error)?;
    let bytes = serde_json::to_vec(&values).map_err(|error| SourceError::new("storage", error.to_string()))?;
    fs::write(path.join("values.json"), bytes).map_err(io_error)
}

fn build_http_client() -> Result<reqwest::Client, SourceError> {
    reqwest::Client::builder()
        .user_agent("Mekuri/0.1 source-runtime")
        .redirect(reqwest::redirect::Policy::none())
        .cookie_store(true)
        .build()
        .map_err(|e| SourceError::new("network-failure", e.to_string()))
}

async fn fetch_bytes(
    client: &reqwest::Client,
    slots: HostLimiters,
    url: Url,
    requested_hosts: &[String],
    referer: Option<&str>,
    token: CancellationToken,
) -> Result<Vec<u8>, SourceError> {
    let mut current = url;
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Mekuri/0.1 source-runtime"),
    );
    if let Some(referer) = referer {
        if let Ok(value) = HeaderValue::from_str(referer) {
            headers.insert(REFERER, value);
        }
    }
    'redirect: for _ in 0..5 {
        if !host_is_allowed(&current, requested_hosts) {
            return Err(SourceError::new(
                "permission-denied",
                "The source redirect points to a host it did not request.",
            ));
        }
        validate_public_destination(&current).await?;
        let host = current.host_str().unwrap_or_default().to_string();
        let host_limiter = {
            let mut limiters = slots.lock().await;
            limiters
                .entry(host)
                .or_insert_with(|| Arc::new(Semaphore::new(4)))
                .clone()
        };
        for attempt in 0..3 {
            let _permit = tokio::select! { permit = host_limiter.clone().acquire_owned() => permit.map_err(|_| SourceError::new("network-failure", "The HTTP service is unavailable."))?, _ = token.cancelled() => return Err(SourceError::new("cancelled", "The request was cancelled.")) };
            let request = client.get(current.clone()).headers(headers.clone());
            let response = tokio::select! { response = request.send() => response.map_err(|e| SourceError::new("network-failure", e.to_string()))?, _ = token.cancelled() => return Err(SourceError::new("cancelled", "The request was cancelled.")) };
            if response.status().is_redirection() {
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(|| {
                        SourceError::new(
                            "network-failure",
                            "The source returned an invalid redirect.",
                        )
                    })?;
                current = current.join(location).map_err(|_| {
                    SourceError::new("permission-denied", "The redirect URL is invalid.")
                })?;
                continue 'redirect;
            }
            if response.status().as_u16() == 429 {
                return Err(SourceError::new(
                    "rate-limit",
                    "The source asked Mekuri to slow down.",
                ));
            }
            if [408, 500, 502, 503, 504].contains(&response.status().as_u16()) && attempt < 2 {
                tokio::time::sleep(Duration::from_millis(150 * (attempt + 1))).await;
                continue;
            }
            if !response.status().is_success() {
                return Err(SourceError::new(
                    "network-failure",
                    format!("The source returned HTTP {}.", response.status()),
                ));
            }
            let length = response.content_length().unwrap_or(0);
            if length > MAX_HTTP_BODY as u64 {
                return Err(SourceError::new(
                    "network-failure",
                    "The source response is too large.",
                ));
            }
            let bytes = tokio::select! { bytes = response.bytes() => bytes.map_err(|e| SourceError::new("network-failure", e.to_string()))?, _ = token.cancelled() => return Err(SourceError::new("cancelled", "The request was cancelled.")) };
            if bytes.len() > MAX_HTTP_BODY {
                return Err(SourceError::new(
                    "network-failure",
                    "The source response is too large.",
                ));
            }
            return Ok(bytes.to_vec());
        }
    }
    Err(SourceError::new("network-failure", "Too many redirects."))
}

fn validate_operation_result(operation: &str, value: &Value) -> Result<(), SourceError> {
    match operation {
        "getPopular" | "getLatest" | "search" => serde_json::from_value::<MangaPage>(value.clone())
            .map_err(|e| {
                SourceError::new(
                    "invalid-result",
                    format!("Invalid paginated manga result: {e}"),
                )
            })
            .and_then(validate_manga_page),
        "getManga" => serde_json::from_value::<MangaDetails>(value.clone())
            .map_err(|e| SourceError::new("invalid-result", format!("Invalid manga details: {e}")))
            .and_then(validate_manga_details),
        "getChapters" => serde_json::from_value::<Vec<Chapter>>(value.clone())
            .map_err(|e| SourceError::new("invalid-result", format!("Invalid chapter result: {e}")))
            .and_then(validate_chapters),
        "getPages" => serde_json::from_value::<Vec<PageReference>>(value.clone())
            .map_err(|e| SourceError::new("invalid-result", format!("Invalid page result: {e}")))
            .and_then(validate_pages),
        _ => Err(SourceError::new(
            "unsupported-api",
            "The requested source operation is not part of host API 1.0.",
        )),
    }
}

fn validate_text(value: &str, label: &str) -> Result<(), SourceError> {
    if value.trim().is_empty() || value.chars().count() > 500 {
        return Err(SourceError::new(
            "invalid-result",
            format!("The extension returned an invalid {label}."),
        ));
    }
    Ok(())
}

fn validate_manga_page(page: MangaPage) -> Result<(), SourceError> {
    if page.page == 0 || page.items.len() > 100 {
        return Err(SourceError::new(
            "invalid-result",
            "The extension returned an invalid page.",
        ));
    }
    let mut ids = HashSet::new();
    for item in page.items {
        validate_text(&item.id, "manga ID")?;
        validate_text(&item.title, "manga title")?;
        if !ids.insert(item.id) {
            return Err(SourceError::new(
                "invalid-result",
                "The extension returned duplicate manga IDs.",
            ));
        }
    }
    Ok(())
}

fn validate_manga_details(details: MangaDetails) -> Result<(), SourceError> {
    validate_text(&details.id, "manga ID")?;
    validate_text(&details.title, "manga title")
}

fn validate_chapters(chapters: Vec<Chapter>) -> Result<(), SourceError> {
    if chapters.len() > 2000 {
        return Err(SourceError::new(
            "invalid-result",
            "The extension returned too many chapters.",
        ));
    }
    let mut ids = HashSet::new();
    let mut orders = HashSet::new();
    for chapter in chapters {
        validate_text(&chapter.id, "chapter ID")?;
        if !ids.insert(chapter.id) || !orders.insert(chapter.order) {
            return Err(SourceError::new(
                "invalid-result",
                "Chapter IDs and ordering values must be unique.",
            ));
        }
        if let Some(number) = chapter.number {
            if !number.is_finite() || number < 0.0 {
                return Err(SourceError::new(
                    "invalid-result",
                    "A chapter number is invalid.",
                ));
            }
        }
        if let Some(external_url) = chapter.external_url {
            let url = Url::parse(&external_url).map_err(|_| {
                SourceError::new("invalid-result", "A chapter external URL is invalid.")
            })?;
            if url.scheme() != "https" || url.host_str().is_none() || url.username() != "" || url.password().is_some() {
                return Err(SourceError::new(
                    "invalid-result",
                    "A chapter external URL must be a public HTTPS URL.",
                ));
            }
        }
    }
    Ok(())
}

fn validate_pages(pages: Vec<PageReference>) -> Result<(), SourceError> {
    if pages.is_empty() || pages.len() > 500 {
        return Err(SourceError::new(
            "invalid-result",
            "The extension returned an invalid page list.",
        ));
    }
    let mut indexes = HashSet::new();
    for page in pages {
        if !indexes.insert(page.index) || page.image_url.len() > 8192 {
            return Err(SourceError::new(
                "invalid-result",
                "Page indexes and image references must be bounded and unique.",
            ));
        }
        if !page.image_url.starts_with("https://")
            && !page.image_url.starts_with("data:image/svg+xml,")
        {
            return Err(SourceError::new(
                "invalid-result",
                "Pages must use HTTPS image URLs.",
            ));
        }
        if let Some(width) = page.width {
            if width == 0 || width > 20_000 {
                return Err(SourceError::new(
                    "invalid-result",
                    "A page width is outside the supported range.",
                ));
            }
        }
        if let Some(height) = page.height {
            if height == 0 || height > 20_000 {
                return Err(SourceError::new(
                    "invalid-result",
                    "A page height is outside the supported range.",
                ));
            }
        }
    }
    Ok(())
}

fn validate_manifest(manifest: &Manifest, paths: &HashSet<String>) -> Result<(), SourceError> {
    if manifest.format_version != 1 {
        return Err(SourceError::new(
            "unsupported-format",
            "This package format version is not supported.",
        ));
    }
    if !manifest
        .id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
        || manifest.id.len() < 3
        || manifest.id.len() > 64
    {
        return Err(SourceError::new(
            "invalid-manifest",
            "The extension ID must be 3–64 lowercase identifier characters.",
        ));
    }
    if manifest.name.trim().is_empty() || manifest.name.len() > 120 {
        return Err(SourceError::new(
            "invalid-manifest",
            "The extension name is missing or too long.",
        ));
    }
    let valid_language_code = |code: &str| {
        !code.is_empty()
            && code.len() <= 16
            && code.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    };
    if !valid_language_code(&manifest.language) {
        return Err(SourceError::new("invalid-manifest", "The default language code is invalid."));
    }
    if let Some(languages) = &manifest.languages {
        if languages.is_empty() || languages.len() > 64 || !languages.iter().all(|option| valid_language_code(&option.code) && !option.label.trim().is_empty() && option.label.len() <= 80) || !languages.iter().any(|option| option.code == manifest.language) || languages.iter().enumerate().any(|(index, option)| languages[..index].iter().any(|previous| previous.code == option.code)) {
            return Err(SourceError::new("invalid-manifest", "Extension language options are invalid."));
        }
    }
    Version::parse(&manifest.version).map_err(|_| {
        SourceError::new(
            "invalid-manifest",
            "The extension version must be semantic versioning.",
        )
    })?;
    if manifest.host_api_version != HOST_API_VERSION {
        return Err(SourceError::new(
            "unsupported-api",
            format!(
                "This extension needs host API {}, but Mekuri provides {}.",
                manifest.host_api_version, HOST_API_VERSION
            ),
        ));
    }
    safe_archive_path(&manifest.entry)?;
    if !manifest.entry.ends_with(".js") {
        return Err(SourceError::new(
            "invalid-manifest",
            "The entry path must point to a JavaScript file.",
        ));
    }
    if let Some(icon) = &manifest.icon {
        safe_archive_path(icon)?;
        if !paths.contains(&icon.to_lowercase()) {
            return Err(SourceError::new(
                "invalid-manifest",
                "The icon path does not exist.",
            ));
        }
    }
    if manifest.requested_hosts.len() > 32 {
        return Err(SourceError::new(
            "invalid-manifest",
            "An extension may request at most 32 hosts.",
        ));
    }
    for host in &manifest.requested_hosts {
        let url = Url::parse(host).map_err(|_| {
            SourceError::new("invalid-manifest", "Requested hosts must be HTTPS origins.")
        })?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(SourceError::new(
                "invalid-manifest",
                "Requested hosts must be HTTPS origins such as https://example.com/.",
            ));
        }
        if let Some(suffix) = url.host_str().and_then(|value| value.strip_prefix("*.")) {
            if suffix.is_empty() || suffix.contains('*') || !suffix.contains('.') {
                return Err(SourceError::new(
                    "invalid-manifest",
                    "Wildcard host permissions must use a scoped pattern such as https://*.example.com/.",
                ));
            }
        }
    }
    Ok(())
}

fn validate_icon(zip: &mut ZipArchive<Cursor<&Vec<u8>>>, path: &str) -> Result<(), SourceError> {
    let index = find_zip_entry(zip, path)?;
    let mut bytes = Vec::new();
    zip.by_index(index)
        .map_err(|_| SourceError::new("invalid-icon", "The icon cannot be read."))?
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() > 1024 * 1024 {
        return Err(SourceError::new("invalid-icon", "The icon is too large."));
    }
    let valid = bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.starts_with(&[0xff, 0xd8, 0xff])
        || bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP")
        || std::str::from_utf8(&bytes)
            .map(|text| {
                text.trim_start().starts_with("<svg")
                    && !text.to_ascii_lowercase().contains("<script")
            })
            .unwrap_or(false);
    if !valid {
        return Err(SourceError::new(
            "invalid-icon",
            "The icon is not a supported PNG, JPEG, WebP, or safe SVG.",
        ));
    }
    Ok(())
}

fn find_zip_entry(
    zip: &mut ZipArchive<Cursor<&Vec<u8>>>,
    wanted: &str,
) -> Result<usize, SourceError> {
    (0..zip.len())
        .find(|index| {
            zip.by_index(*index)
                .map(|entry| {
                    entry.name().replace('\\', "/").to_lowercase()
                        == wanted.replace('\\', "/").to_lowercase()
                })
                .unwrap_or(false)
        })
        .ok_or_else(|| {
            SourceError::new("invalid-package", "The package must contain manifest.json.")
        })
}

fn safe_archive_path(raw: &str) -> Result<String, SourceError> {
    let normalized = raw.replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.contains(':')
        || normalized.contains("//")
    {
        return Err(SourceError::new(
            "unsafe-path",
            "Absolute and drive-qualified archive paths are not allowed.",
        ));
    }
    let path = Path::new(&normalized);
    for component in path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(SourceError::new(
                "unsafe-path",
                "Archive paths may not contain traversal or ambiguous components.",
            ));
        }
    }
    Ok(normalized.trim_end_matches('/').to_string())
}

fn is_native_payload(path: &str) -> bool {
    [
        ".exe", ".dll", ".so", ".dylib", ".wasm", ".com", ".bat", ".cmd", ".ps1",
    ]
    .iter()
    .any(|suffix| path.to_ascii_lowercase().ends_with(suffix))
}
fn internal_id(id: &str) -> String {
    id.to_string()
}
fn io_error(error: impl std::fmt::Display) -> SourceError {
    SourceError::new("storage", error.to_string())
}

fn cleanup_old_staging(path: &Path) {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry
                .metadata()
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|time| time.elapsed().ok())
                .unwrap_or_default()
                > STAGING_TTL
            {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
}

fn validate_network_url(raw: &str, requested_hosts: &[String]) -> Result<Url, SourceError> {
    let url = Url::parse(raw).map_err(|_| {
        SourceError::new(
            "permission-denied",
            "The extension requested an invalid URL.",
        )
    })?;
    if url.scheme() != "https" {
        return Err(SourceError::new(
            "permission-denied",
            "Extension networking only permits HTTPS.",
        ));
    }
    if !host_is_allowed(&url, requested_hosts) {
        return Err(SourceError::new(
            "permission-denied",
            "The extension has not requested permission for this host.",
        ));
    }
    Ok(url)
}

fn host_is_allowed(url: &Url, requested_hosts: &[String]) -> bool {
    let Some(current_host) = url.host_str() else {
        return false;
    };
    requested_hosts.iter().any(|host| {
        let Ok(permission) = Url::parse(host) else {
            return false;
        };
        if permission.scheme() != url.scheme()
            || permission.port_or_known_default() != url.port_or_known_default()
        {
            return false;
        }
        let Some(permission_host) = permission.host_str() else {
            return false;
        };
        if let Some(suffix) = permission_host.strip_prefix("*.") {
            current_host != suffix
                && current_host
                    .to_ascii_lowercase()
                    .ends_with(&format!(".{suffix}"))
        } else {
            current_host.eq_ignore_ascii_case(permission_host)
        }
    })
}

async fn validate_public_destination(url: &Url) -> Result<(), SourceError> {
    let host = url
        .host_str()
        .ok_or_else(|| SourceError::new("permission-denied", "The URL has no host."))?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return Err(SourceError::new(
            "permission-denied",
            "Local destinations are not available to source extensions.",
        ));
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| SourceError::new("permission-denied", "The URL has no port."))?;
    let addresses = lookup_host((host, port))
        .await
        .map_err(|_| SourceError::new("network-failure", "The host could not be resolved."))?;
    for address in addresses {
        if is_private_ip(address.ip()) {
            return Err(SourceError::new(
                "permission-denied",
                "Private and loopback network destinations are not available.",
            ));
        }
    }
    Ok(())
}
fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.octets()[0] == 169 && ip.octets()[1] == 254
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.segments()[0] & 0xffc0 == 0xfe80
        }
    }
}

fn sniff_image(bytes: &[u8]) -> Result<(&'static str, Vec<u8>), SourceError> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok(("image/png", bytes.to_vec()))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok(("image/jpeg", bytes.to_vec()))
    } else if bytes.starts_with(b"GIF8") {
        Ok(("image/gif", bytes.to_vec()))
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Ok(("image/webp", bytes.to_vec()))
    } else if let Ok(text) = std::str::from_utf8(bytes) {
        if text.trim_start().starts_with("<svg") && !text.to_ascii_lowercase().contains("<script") {
            Ok(("image/svg+xml", bytes.to_vec()))
        } else {
            Err(SourceError::new(
                "invalid-result",
                "The page reference was not an approved image.",
            ))
        }
    } else {
        Err(SourceError::new(
            "invalid-result",
            "The page reference was not an approved image.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    #[test]
    fn rejects_traversal() {
        assert!(safe_archive_path("../manifest.json").is_err());
        assert!(safe_archive_path("C:/manifest.json").is_err());
    }
    #[test]
    fn accepts_normal_path() {
        assert_eq!(
            safe_archive_path("assets\\cover.svg").unwrap(),
            "assets/cover.svg"
        );
    }
    #[test]
    fn rejects_native_payload() {
        assert!(is_native_payload("native.dll"));
        assert!(!is_native_payload("source.js"));
    }
    #[test]
    fn private_networks_are_rejected() {
        assert!(is_private_ip("127.0.0.1".parse().unwrap()));
        assert!(is_private_ip("10.0.0.1".parse().unwrap()));
    }
    #[test]
    fn redirects_must_stay_on_declared_hosts() {
        let allowed = vec!["https://example.com/".to_string()];
        assert!(host_is_allowed(
            &Url::parse("https://example.com/path").unwrap(),
            &allowed
        ));
        assert!(!host_is_allowed(
            &Url::parse("https://other.example/path").unwrap(),
            &allowed
        ));
    }
    #[test]
    fn scoped_wildcard_hosts_match_only_subdomains() {
        let allowed = vec!["https://*.mangadex.network/".to_string()];
        assert!(host_is_allowed(
            &Url::parse("https://node.mangadex.network/page").unwrap(),
            &allowed
        ));
        assert!(!host_is_allowed(
            &Url::parse("https://mangadex.network/page").unwrap(),
            &allowed
        ));
        assert!(!host_is_allowed(
            &Url::parse("https://node.other.example/page").unwrap(),
            &allowed
        ));
    }
    fn valid_manifest() -> Manifest {
        Manifest {
            format_version: 1,
            id: "com.example.source".into(),
            name: "Example".into(),
            version: "1.0.0".into(),
            host_api_version: HOST_API_VERSION.into(),
            entry: "source.js".into(),
            description: None,
            author: None,
            icon: None,
            language: "en".into(),
            languages: None,
            content_rating: ContentRating::Safe,
            requested_hosts: vec!["https://example.com/".into()],
        }
    }
    #[test]
    fn manifest_rejects_unsupported_host_api() {
        let mut manifest = valid_manifest();
        manifest.host_api_version = "9.0".into();
        let paths = ["manifest.json", "source.js"]
            .into_iter()
            .map(str::to_owned)
            .collect();
        assert_eq!(
            validate_manifest(&manifest, &paths).unwrap_err().code,
            "unsupported-api"
        );
    }
    #[test]
    fn manifest_requires_declared_entry_and_safe_host_origin() {
        let mut manifest = valid_manifest();
        manifest.entry = "../source.js".into();
        let paths = ["manifest.json", "source.js"]
            .into_iter()
            .map(str::to_owned)
            .collect();
        assert_eq!(
            validate_manifest(&manifest, &paths).unwrap_err().code,
            "unsafe-path"
        );
        manifest.entry = "source.js".into();
        manifest.requested_hosts = vec!["http://example.com/".into()];
        assert_eq!(
            validate_manifest(&manifest, &paths).unwrap_err().code,
            "invalid-manifest"
        );
    }
    #[test]
    fn result_validation_rejects_duplicate_ids_and_non_https_pages() {
        let page = json!({ "items": [
            { "id": "same", "title": "One", "coverUrl": null, "publicationStatus": null, "contentRating": null },
            { "id": "same", "title": "Two", "coverUrl": null, "publicationStatus": null, "contentRating": null }
        ], "page": 1, "hasNextPage": false });
        assert_eq!(
            validate_operation_result("getPopular", &page)
                .unwrap_err()
                .code,
            "invalid-result"
        );
        let pages = json!([{ "index": 0, "imageUrl": "http://not-allowed.test/image.png", "width": null, "height": null, "referer": null }]);
        assert_eq!(
            validate_operation_result("getPages", &pages)
                .unwrap_err()
                .code,
            "invalid-result"
        );
    }
    fn package(manifest: &str, source: &str) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file("manifest.json", options).unwrap();
        writer.write_all(manifest.as_bytes()).unwrap();
        writer.start_file("source.js", options).unwrap();
        writer.write_all(source.as_bytes()).unwrap();
        writer.finish().unwrap().into_inner()
    }
    #[test]
    fn valid_package_is_staged_without_executing_source() {
        let root =
            std::env::temp_dir().join(format!("mekuri-extension-test-{}", Uuid::new_v4().simple()));
        let mut manager = ExtensionManager::open(root.clone()).unwrap();
        let manifest = r#"{"formatVersion":1,"id":"com.example.test","name":"Test","version":"1.0.0","hostApiVersion":"1.0","entry":"source.js","language":"en","contentRating":"safe","requestedHosts":[]}"#;
        let staged = manager
            .inspect(package(
                manifest,
                "while (true) {}\nglobalThis.source = {};",
            ))
            .unwrap();
        assert_eq!(staged.manifest.id, "com.example.test");
        assert_eq!(staged.staging_id.len(), 32);
        assert!(manager.stages.contains_key(&staged.staging_id));
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn malformed_manifest_is_rejected_before_staging() {
        let root =
            std::env::temp_dir().join(format!("mekuri-extension-test-{}", Uuid::new_v4().simple()));
        let mut manager = ExtensionManager::open(root.clone()).unwrap();
        let error = manager
            .inspect(package("{not-json}", "globalThis.source = {};"))
            .unwrap_err();
        assert_eq!(error.code, "invalid-manifest");
        assert!(manager.stages.is_empty());
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn cancelled_infinite_script_is_interrupted() {
        let root =
            std::env::temp_dir().join(format!("mekuri-runtime-test-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("source.js"),
            "while (true) {}\nglobalThis.source = {};",
        )
        .unwrap();
        let mut manifest = valid_manifest();
        manifest.entry = "source.js".into();
        let token = CancellationToken::new();
        token.cancel();
        let result = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(run_javascript(
                manifest,
                root.clone(),
                "getPopular".into(),
                json!({ "page": 1 }),
                build_http_client().unwrap(),
                Arc::new(tokio::sync::Mutex::new(HashMap::new())),
                token,
                root.join("settings"),
            ))
        })
        .join()
        .unwrap();
        assert!(result.is_err());
    }
    #[test]
    fn javascript_rejection_preserves_the_extension_error_message() {
        let root = std::env::temp_dir().join(format!(
            "mekuri-runtime-error-test-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("source.js"),
            r#"globalThis.source = { getPopular: async () => { throw new Error("fixture source failure"); } };"#,
        )
        .unwrap();
        let manifest = valid_manifest();
        let token = CancellationToken::new();
        let runtime_root = root.clone();
        let result = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(run_javascript(
                manifest,
                runtime_root.clone(),
                "getPopular".into(),
                json!({ "page": 1 }),
                build_http_client().unwrap(),
                Arc::new(tokio::sync::Mutex::new(HashMap::new())),
                token,
                runtime_root.join("settings"),
            ))
        })
        .join()
        .unwrap();
        let error = result.unwrap_err();
        assert_eq!(error.code, "runtime");
        assert!(error.message.contains("fixture source failure"));
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn javascript_receives_structured_arguments_and_returns_valid_results() {
        let root = std::env::temp_dir().join(format!(
            "mekuri-runtime-result-test-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("source.js"),
            r#"globalThis.source = { getPopular: async ({ page }) => ({ items: [{ id: "fixture-id", title: `Page ${page}`, coverUrl: null, publicationStatus: null, contentRating: null }], page, hasNextPage: false }) };"#,
        )
        .unwrap();
        let manifest = valid_manifest();
        let token = CancellationToken::new();
        let runtime_root = root.clone();
        let result = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(run_javascript(
                manifest,
                runtime_root.clone(),
                "getPopular".into(),
                json!({ "page": 3 }),
                build_http_client().unwrap(),
                Arc::new(tokio::sync::Mutex::new(HashMap::new())),
                token,
                runtime_root.join("settings"),
            ))
        })
        .join()
        .unwrap()
        .unwrap();
        assert_eq!(result["page"], 3);
        assert_eq!(result["items"][0]["title"], "Page 3");
        let _ = fs::remove_dir_all(root);
    }
}
