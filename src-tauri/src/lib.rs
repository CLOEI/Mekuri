mod extensions;

use extensions::{AppState, ExtensionManager, SourceError};
use std::{
    path::PathBuf,
    sync::{Arc, OnceLock},
};
use tauri::{Manager, State};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn list_extensions(
    state: State<'_, AppState>,
) -> Result<Vec<extensions::InstalledExtension>, SourceError> {
    Ok(state.manager.lock().await.list())
}

#[tauri::command]
async fn inspect_extension(
    archive: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<extensions::StagedExtension, SourceError> {
    state.manager.lock().await.inspect(archive)
}

#[tauri::command]
async fn install_staged_extension(
    staging_id: String,
    acknowledge_unsigned: bool,
    language: Option<String>,
    state: State<'_, AppState>,
) -> Result<extensions::InstalledExtension, SourceError> {
    state
        .manager
        .lock()
        .await
        .install(&staging_id, acknowledge_unsigned, language)
}

#[tauri::command]
async fn set_extension_enabled(
    extension_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<extensions::InstalledExtension, SourceError> {
    state
        .manager
        .lock()
        .await
        .set_enabled(&extension_id, enabled)
}

#[tauri::command]
async fn set_extension_language(
    extension_id: String,
    language: String,
    state: State<'_, AppState>,
) -> Result<extensions::InstalledExtension, SourceError> {
    state.manager.lock().await.set_language(&extension_id, language)
}

#[tauri::command]
async fn uninstall_extension(
    extension_id: String,
    remove_data: bool,
    state: State<'_, AppState>,
) -> Result<(), SourceError> {
    state
        .manager
        .lock()
        .await
        .uninstall(&extension_id, remove_data)
}

#[tauri::command]
async fn source_call(
    extension_id: String,
    operation: String,
    argument: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, SourceError> {
    ExtensionManager::call_source(state.manager.clone(), extension_id, operation, argument).await
}

#[tauri::command]
async fn fetch_extension_image(
    extension_id: String,
    image_url: String,
    referer: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, SourceError> {
    ExtensionManager::fetch_image(state.manager.clone(), extension_id, image_url, referer).await
}

static IMAGE_ROOT: OnceLock<PathBuf> = OnceLock::new();

fn image_response(resource_id: &str) -> tauri::http::Response<Vec<u8>> {
    let Some(root) = IMAGE_ROOT.get() else {
        return tauri::http::Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap();
    };
    if resource_id.len() != 32 || !resource_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return tauri::http::Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap();
    }
    let Ok(bytes) = std::fs::read(root.join(resource_id)) else {
        return tauri::http::Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap();
    };
    let Some(index) = bytes.iter().position(|byte| *byte == b'\n') else {
        return tauri::http::Response::builder()
            .status(415)
            .body(Vec::new())
            .unwrap();
    };
    let (mime, body) = bytes.split_at(index);
    let body = &body[1..];
    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", String::from_utf8_lossy(mime).as_ref())
        .header("Cache-Control", "private, max-age=86400")
        .body(body.to_vec())
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("mekuri", |_ctx, request| {
            let path = request.uri().path().trim_start_matches('/');
            if let Some(resource_id) = path.strip_prefix("image/") {
                image_response(resource_id)
            } else {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            }
        })
        .setup(|app| {
            let data_dir: PathBuf = app.path().app_data_dir()?;
            let _ = IMAGE_ROOT.set(data_dir.join("extensions").join("image-cache"));
            let manager = ExtensionManager::open(data_dir)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            app.manage(AppState {
                manager: Arc::new(tokio::sync::Mutex::new(manager)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_extensions,
            inspect_extension,
            install_staged_extension,
            set_extension_enabled,
            set_extension_language,
            uninstall_extension,
            source_call,
            fetch_extension_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
