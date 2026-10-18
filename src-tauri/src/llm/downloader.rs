use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub model_name: String,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub percentage: f64,
}

/// Download a model file from Hugging Face with live progress streaming.
pub async fn download_model(
    app: &tauri::AppHandle,
    model_dir: &Path,
    model_id: &str,
    url: &str,
    filename: &str,
    _expected_sha256: &str,
) -> Result<(), String> {
    tokio::fs::create_dir_all(model_dir)
        .await
        .map_err(|e| format!("Failed to create model directory: {}", e))?;

    let client = reqwest::Client::builder()
        .user_agent("MyTerminal/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP status: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let temp_path = model_dir.join(format!("{}.part", filename));
    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create temporary file: {}", e))?;

    let mut downloaded: u64 = 0;

    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Stream error: {}", e))? {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        downloaded += chunk.len() as u64;

        let percentage = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        let progress = DownloadProgress {
            model_id: model_id.to_string(),
            model_name: filename.to_string(),
            bytes_downloaded: downloaded,
            total_bytes: total_size,
            percentage,
        };

        let _ = app.emit("model-download-progress", &progress);
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    let final_path = model_dir.join(filename);
    tokio::fs::rename(&temp_path, final_path)
        .await
        .map_err(|e| format!("Failed to save final model file: {}", e))?;

    Ok(())
}
