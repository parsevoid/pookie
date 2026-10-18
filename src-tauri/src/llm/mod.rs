// LLM Module — Model management, downloading, and inference.
//
// This module handles:
// 1. Model directory management
// 2. Model downloading from Hugging Face with progress tracking
// 3. Model loading via llama-cpp-bindings
// 4. Inference (command generation from natural language)

#![allow(dead_code)]

pub mod downloader;
pub mod local_inference;
pub mod model_registry;
pub mod prompt_templates;

use std::path::PathBuf;

/// Returns the platform-appropriate directory for storing GGUF model files.
///
/// - macOS:   ~/Library/Application Support/com.myterminal.desktop/models/
/// - Windows: C:\Users\<user>\AppData\Roaming\com.myterminal.desktop\models\
/// - Linux:   ~/.local/share/com.myterminal.desktop/models/
pub fn get_model_directory() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| "Could not determine application data directory".to_string())?;

    Ok(data_dir.join("com.myterminal.desktop").join("models"))
}

/// Check if a specific model file exists on disk.
pub fn is_model_downloaded(filename: &str) -> bool {
    if let Ok(model_dir) = get_model_directory() {
        model_dir.join(filename).exists()
    } else {
        false
    }
}

/// Get the full path to a model file.
pub fn get_model_path(filename: &str) -> Result<PathBuf, String> {
    let model_dir = get_model_directory()?;
    let path = model_dir.join(filename);
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("Model file not found: {}", path.display()))
    }
}
