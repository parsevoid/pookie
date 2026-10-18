// MyTerminal — Tauri Backend Entry Point
//
// This is the Rust backend for the cross-platform MyTerminal app.
// It handles: PTY sessions, SSH connections, model downloading, and LLM inference.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod pty;
mod ssh;

use pty::PtyManager;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};


/// Application state shared across all IPC commands.
struct AppState {
    model_status: Mutex<ModelStatus>,
    pty_manager: Arc<PtyManager>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum ModelStatus {
    NotDownloaded,
    Downloading { progress: f64 },
    Ready,
    Error(String),
}

// ─── PTY IPC Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn create_pty_session(
    app: tauri::AppHandle,
    state: State<AppState>,
    id: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    cols: Option<u16>,
    rows: Option<u16>,
    env: Option<std::collections::HashMap<String, String>>,
    password: Option<String>,
) -> Result<(), String> {
    state.pty_manager.create_session(
        app,
        id,
        command,
        args,
        cols.unwrap_or(80),
        rows.unwrap_or(24),
        env,
        password,
    )
}

#[tauri::command]
fn write_pty_data(state: State<AppState>, id: String, data: String) -> Result<(), String> {
    state.pty_manager.write_data(&id, &data)
}

#[tauri::command]
fn resize_pty(state: State<AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.pty_manager.resize(&id, cols, rows)
}

#[tauri::command]
fn close_pty_session(state: State<AppState>, id: String) -> Result<(), String> {
    state.pty_manager.close_session(&id)
}

// ─── LLM & System IPC Commands ───────────────────────────────────────────────

/// Check if the LLM model is downloaded and ready.
#[tauri::command]
fn get_model_status(state: State<AppState>) -> ModelStatus {
    let mut status = state.model_status.lock().unwrap();
    let downloaded = llm::local_inference::get_downloaded_model_ids();
    if !downloaded.is_empty() {
        *status = ModelStatus::Ready;
    }
    status.clone()
}

/// Get the list of model IDs currently downloaded and available on disk as GGUF files.
#[tauri::command]
fn get_downloaded_models() -> Vec<String> {
    llm::local_inference::get_downloaded_model_ids()
}

/// Start downloading the default Kali-Terminus-v2 or reasoning model in the background.
#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<String, String> {
    {
        let mut status = state.model_status.lock().unwrap();
        *status = ModelStatus::Downloading { progress: 0.0 };
    }

    let model_dir = llm::get_model_directory()
        .map_err(|e| format!("Failed to get model directory: {}", e))?;

    let id = model_id.unwrap_or_else(|| "ternary-bonsai-1.7b".to_string());
    let registry = llm::model_registry::get_default_registry();
    let entry = registry
        .iter()
        .find(|m| m.id == id)
        .cloned()
        .unwrap_or_else(|| registry[0].clone());

    match llm::downloader::download_model(
        &app,
        &model_dir,
        &entry.id,
        &entry.download_url,
        &entry.filename,
        &entry.sha256,
    )
    .await
    {
        Ok(()) => {
            let mut status = state.model_status.lock().unwrap();
            *status = ModelStatus::Ready;
            let _ = app.emit("models-changed", ());
            Ok(format!("Model '{}' downloaded successfully", entry.name))
        }
        Err(e) => {
            let mut status = state.model_status.lock().unwrap();
            *status = ModelStatus::Error(e.clone());
            Err(e)
        }
    }
}

/// Extracts the actual command string from raw model output, unwrapping
/// tool call tags (<call:exec>{"command": "..."}</call:exec>), XML, JSON blobs, or code blocks.
fn extract_command_from_tool_call(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 1. Tool call tags: <call:exec>{"command": "..."}</call:exec> or <call:bash>...</call:bash>
    if let Some(start_idx) = trimmed.find("<call:") {
        if let Some(tag_end) = trimmed[start_idx..].find('>') {
            let content_start = start_idx + tag_end + 1;
            let content = if let Some(end_idx) = trimmed[content_start..].find("</call:") {
                &trimmed[content_start..content_start + end_idx]
            } else {
                &trimmed[content_start..]
            };
            if let Some(cmd) = parse_json_command(content) {
                return Some(cmd);
            }
        }
    }

    // 2. <tool_call> tags
    if let Some(start_idx) = trimmed.find("<tool_call>") {
        let content_start = start_idx + "<tool_call>".len();
        let content = if let Some(end_idx) = trimmed[content_start..].find("</tool_call>") {
            &trimmed[content_start..content_start + end_idx]
        } else {
            &trimmed[content_start..]
        };
        if let Some(cmd) = parse_json_command(content) {
            return Some(cmd);
        }
    }

    // 3. Raw JSON: {"command": "..."}
    if trimmed.starts_with('{') && trimmed.contains("\"command\"") {
        if let Some(cmd) = parse_json_command(trimmed) {
            return Some(cmd);
        }
    }

    None
}

fn parse_json_command(text: &str) -> Option<String> {
    let t = text.trim();
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(t) {
        if let Some(cmd_val) = val.get("command").and_then(|v| v.as_str()) {
            let cmd = cmd_val.trim();
            if !cmd.is_empty() && cmd != "command()" && cmd != "none" {
                return Some(cmd.to_string());
            }
        }
        if let Some(args) = val.get("arguments") {
            if let Some(cmd_val) = args.get("command").and_then(|v| v.as_str()) {
                let cmd = cmd_val.trim();
                if !cmd.is_empty() && cmd != "command()" && cmd != "none" {
                    return Some(cmd.to_string());
                }
            }
        }
    }

    // Quick fallback for unclosed or escaped JSON
    let marker = "\"command\":";
    if let Some(idx) = t.find(marker) {
        let rest = t[idx + marker.len()..].trim();
        let rest_unquoted = if rest.starts_with('"') { &rest[1..] } else { rest };
        if let Some(end_quote) = rest_unquoted.find('"') {
            let cmd = rest_unquoted[..end_quote].trim();
            if !cmd.is_empty() && cmd != "command()" && cmd != "none" {
                return Some(cmd.replace("\\\"", "\""));
            }
        }
    }

    None
}

/// Clean up raw model outputs: strips thinking tags (<think>...</think>),
/// unwraps tool calls (<call:exec>...</call:exec>), removes conversational chatter/comments,
/// and returns strictly the executable shell command line.
fn sanitize_model_output(raw: &str, is_reasoning: bool) -> String {
    let mut result = Vec::new();
    let mut in_think = false;

    // Check if the entire block is a single tool call
    if let Some(cmd) = extract_command_from_tool_call(raw) {
        return cmd;
    }

    for line in raw.lines() {
        let trimmed = line.trim();

        // Handle DeepSeek R1 / Qwen <think> tags — discard thinking completely
        if trimmed.contains("<think>") {
            in_think = true;
            continue;
        }
        if trimmed.contains("</think>") {
            in_think = false;
            let after = trimmed.replace("</think>", "").trim().to_string();
            if !after.is_empty() && !after.starts_with('#') && !after.starts_with("//") && !is_conversational_chatter(&after) {
                let clean = after.trim_start_matches('$').trim();
                if !clean.is_empty() {
                    result.push(clean.to_string());
                }
            }
            continue;
        }

        if in_think {
            continue;
        }

        // Check if line contains a tool call tag
        if trimmed.contains("<call:") || trimmed.contains("<tool_call>") {
            if let Some(cmd) = extract_command_from_tool_call(trimmed) {
                result.push(cmd);
            }
            continue;
        }

        // Strip markdown backticks
        if trimmed.starts_with("```") {
            continue;
        }

        // Drop empty lines and comments (no explanation / no # in output)
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }

        // Drop conversational commentary
        if is_conversational_chatter(trimmed) {
            continue;
        }

        let clean = trimmed.trim_start_matches('$').trim();
        if !clean.is_empty() {
            result.push(clean.to_string());
        }
    }

    if is_reasoning {
        // If multiple clean command lines were produced, chain with " && "
        if result.len() > 1 {
            return result.join(" && ");
        } else if let Some(cmd) = result.first() {
            return cmd.clone();
        }
    }

    result.join("\n").trim().to_string()
}

fn is_conversational_chatter(line: &str) -> bool {
    let lower = line.trim().to_lowercase();
    let chatter_starters = [
        "okay", "ok", "sure", "here", "to ", "i ", "you ", "we ", "let's", "let ",
        "the ", "this ", "certainly", "note:", "first", "in order to", "how to",
        "please", "hello", "hi ", "as an", "what", "why", "when", "there", "based on",
        "output:", "command:", "explanation:", "step", "remember", "user",
    ];
    for starter in chatter_starters {
        if lower.starts_with(starter) {
            return true;
        }
    }
    if lower.contains("help the user")
        || lower.contains("complete the")
        || lower.contains("shell command")
        || lower.contains("i need to")
        || lower.contains("user typed")
        || lower.contains("you can use")
        || lower.contains("is used to")
        || lower.contains("stands for")
    {
        return true;
    }
    false
}

/// Normalizes auto-suggestion output so it ALWAYS completes the entire command line
/// starting with the user's input, discarding any conversational explanations or chatter.
fn normalize_suggestion_output(raw_output: &str, user_input: &str) -> String {
    let user_trimmed = user_input.trim();
    if user_trimmed.is_empty() {
        return String::new();
    }

    // 1. Unwrap any tool call wrappers (e.g. <call:exec>{"command": "..."}</call:exec>)
    let unwrapped = if let Some(cmd) = extract_command_from_tool_call(raw_output) {
        cmd
    } else {
        raw_output.to_string()
    };

    // 2. Strip any <think>...</think> blocks from DeepSeek R1
    let no_think = if unwrapped.contains("<think>") {
        if let Some(idx) = unwrapped.find("</think>") {
            unwrapped[idx + 8..].to_string()
        } else {
            // Unclosed think tag: entire content is reasoning thought
            String::new()
        }
    } else {
        unwrapped
    };

    // 3. Extract from markdown code fences if present (e.g. ```bash ... ```)
    let text_to_parse = if let Some(start) = no_think.find("```") {
        let after_start = &no_think[start + 3..];
        let code_content = if let Some(first_newline) = after_start.find('\n') {
            &after_start[first_newline + 1..]
        } else {
            after_start
        };
        if let Some(end) = code_content.find("```") {
            code_content[..end].to_string()
        } else {
            code_content.to_string()
        }
    } else {
        no_think
    };

    // 4. Candidate line filtering: find genuine shell command lines
    let mut candidate_lines = Vec::new();
    for raw_line in text_to_parse.lines() {
        let line = raw_line.trim();
        if line.is_empty()
            || line.starts_with('#')
            || line.starts_with("```")
            || line.starts_with("<call:")
            || line.starts_with("<tool_call>")
        {
            continue;
        }

        // Strip backticks if single line is enclosed in `cmd`
        let unbackticked = if line.starts_with('`') && line.ends_with('`') && line.len() >= 2 {
            &line[1..line.len() - 1]
        } else {
            line
        };

        let clean = unbackticked.trim_start_matches('$').trim_start_matches('>').trim();
        if clean.is_empty() || is_conversational_chatter(clean) {
            continue;
        }

        candidate_lines.push(clean.to_string());
    }

    if candidate_lines.is_empty() {
        return String::new();
    }

    let user_lower = user_trimmed.to_lowercase();
    let user_words: Vec<&str> = user_trimmed.split_whitespace().collect();
    let first_word = user_words.first().copied().unwrap_or("");

    // 5. Look for the best command match among candidates
    // A: A candidate that starts with the exact user input (e.g. "mkdir -p dir")
    for candidate in &candidate_lines {
        if candidate.to_lowercase().starts_with(&user_lower) {
            return candidate.clone();
        }
    }

    // B: A candidate that starts with options/flags (e.g. "-p mydir")
    for candidate in &candidate_lines {
        if candidate.starts_with('-') {
            return format!("{} {}", user_trimmed, candidate);
        }
    }

    // C: If user typed multiple words (e.g. "git status") and candidate starts with the last word ("status -s")
    if user_words.len() > 1 {
        let last_word = user_words.last().unwrap().to_lowercase();
        for candidate in &candidate_lines {
            if candidate.to_lowercase().starts_with(&last_word) {
                let prefix = user_words[..user_words.len() - 1].join(" ");
                return format!("{} {}", prefix, candidate);
            }
        }
    }

    // D: If candidate starts with the first word (e.g. user typed "mkdir", candidate is "mkdir -p new_dir")
    for candidate in &candidate_lines {
        if candidate.to_lowercase().starts_with(&first_word.to_lowercase()) {
            return candidate.clone();
        }
    }

    // E: If candidate contains user_input as a command invocation (e.g. "sudo mkdir -p ...")
    for candidate in &candidate_lines {
        if let Some(pos) = candidate.to_lowercase().find(&user_lower) {
            if pos == 0 || candidate.as_bytes()[pos - 1] == b' ' {
                return candidate[pos..].to_string();
            }
        }
    }

    // Never return conversational chatter
    String::new()
}

/// Generate a command using local GGUF Large Language Model (LLM) or Large Reasoning Model (LRM).
/// Completely offline — runs directly on device via llama.cpp with Metal/GPU acceleration.
/// Zero external API calls, zero Ollama dependencies.
#[tauri::command]
async fn generate_command_llm(
    prompt: String,
    model_id: Option<String>,
    mode: Option<String>,
    target_env: Option<String>,
    installed_tools: Option<Vec<String>>,
) -> Result<String, String> {
    let text = prompt.trim();
    if text.is_empty() {
        return Err("Empty prompt".to_string());
    }

    // Determine if this is a reasoning query based on explicit mode parameter
    // or prefixes in the prompt ("@" or "Task:").
    let is_reasoning = match mode.as_deref() {
        Some("reasoning") => true,
        Some("suggestion") => false,
        _ => text.starts_with('@') || text.starts_with("Task:"),
    };

    // Strip leading '@' if present
    let clean_text = if text.starts_with('@') {
        text.trim_start_matches('@').trim()
    } else {
        text
    };

    let (system_prompt, local_prompt) = if is_reasoning {
        (
            llm::prompt_templates::build_reasoning_prompt(target_env.as_deref(), installed_tools.as_deref()),
            format!("Task: {}\nCommand:", clean_text),
        )
    } else {
        (
            llm::prompt_templates::build_suggestion_prompt(clean_text, target_env.as_deref(), installed_tools.as_deref()),
            format!("User: {}\nOutput:", clean_text),
        )
    };

    let effective_model_id = model_id.as_deref().unwrap_or("ternary-bonsai-1.7b");

    // ── Primary: Run local GGUF model inference ──
    if llm::local_inference::is_local_model_available(effective_model_id) {
        let local_model_id = effective_model_id.to_string();
        let local_system = system_prompt;
        let local_prompt = local_prompt;
        let local_max_tokens = if is_reasoning { 128u32 } else { 64u32 };
        let local_temp = 0.1f32;

        let local_result = tokio::task::spawn_blocking(move || {
            llm::local_inference::generate_local(
                &local_model_id,
                &local_system,
                &local_prompt,
                local_max_tokens,
                local_temp,
            )
        })
        .await
        .map_err(|e| format!("Local inference task failed: {}", e))?;

        match local_result {
            Ok(output) if !output.is_empty() => {
                if is_reasoning {
                    let cleaned = sanitize_model_output(&output, true);
                    return Ok(if cleaned.is_empty() { output } else { cleaned });
                } else {
                    let normalized = normalize_suggestion_output(&output, clean_text);
                    return Ok(if normalized.is_empty() { output } else { normalized });
                }
            }
            Ok(_) => return Err("Model generated empty response".to_string()),
            Err(e) => return Err(format!("Local inference error: {}", e)),
        }
    }

    // Requested model is not downloaded
    Err(format!(
        "Model '{}' is not downloaded. Open Settings → Model Manager to download it for offline use.",
        effective_model_id
    ))
}

/// Delete a downloaded model file from disk to reclaim storage.
#[tauri::command]
async fn delete_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<String, String> {
    // Unload active model from memory if loaded
    llm::local_inference::unload_model();

    let model_dir = llm::get_model_directory()
        .map_err(|e| format!("Failed to get model directory: {}", e))?;

    let mut deleted_any = false;
    let registry = llm::model_registry::get_default_registry();
    if let Some(entry) = registry.iter().find(|m| m.id == model_id) {
        let file_path = model_dir.join(&entry.filename);
        if file_path.exists() {
            if let Err(e) = std::fs::remove_file(&file_path) {
                eprintln!("[MyTerminal] Failed to delete file {}: {}", file_path.display(), e);
            } else {
                deleted_any = true;
            }
        }
        let part_path = model_dir.join(format!("{}.part", entry.filename));
        if part_path.exists() {
            let _ = std::fs::remove_file(&part_path);
        }
    }

    // Also check for any matching file in model directory
    if let Ok(entries) = std::fs::read_dir(&model_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.to_lowercase().contains(&model_id.to_lowercase()) {
                if std::fs::remove_file(entry.path()).is_ok() {
                    deleted_any = true;
                }
            }
        }
    }

    // Notify frontend that models on disk have changed
    let _ = app.emit("models-changed", ());

    if deleted_any {
        Ok(format!("Model '{}' deleted successfully", model_id))
    } else {
        Ok(format!("Model '{}' removed", model_id))
    }
}

/// Get system information for OS-aware command generation.
#[tauri::command]
fn get_system_info() -> SystemInfo {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "zsh".to_string());
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        shell,
        installed_tools: llm::prompt_templates::detect_installed_tools(),
    }
}

#[derive(Serialize)]
struct SystemInfo {
    os: String,
    arch: String,
    family: String,
    shell: String,
    installed_tools: Vec<String>,
}

// ─── SSH & SFTP Remote File Commands ─────────────────────────────────────────

#[tauri::command]
fn generate_ssh_key(
    name: String,
    key_type: String,
    path: Option<String>,
    passphrase: Option<String>,
    comment: Option<String>,
    resident: Option<bool>,
) -> Result<ssh::GeneratedKeyInfo, String> {
    ssh::generate_ssh_key_internal(
        &name,
        &key_type,
        path,
        passphrase,
        comment,
        resident.unwrap_or(true),
    )
}

#[tauri::command]
async fn sftp_list_files(
    config: ssh::SSHConnectConfig,
    remote_path: String,
) -> Result<Vec<ssh::RemoteFileItem>, String> {
    tokio::task::spawn_blocking(move || ssh::sftp_list_files_internal(config, remote_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_read_file(
    config: ssh::SSHConnectConfig,
    file_path: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || ssh::sftp_read_file_internal(config, file_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_write_file(
    config: ssh::SSHConnectConfig,
    file_path: String,
    content: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::sftp_write_file_internal(config, file_path, content))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_create_dir(
    config: ssh::SSHConnectConfig,
    dir_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::sftp_create_dir_internal(config, dir_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_delete_file(
    config: ssh::SSHConnectConfig,
    target_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::sftp_delete_file_internal(config, target_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_rename_file(
    config: ssh::SSHConnectConfig,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::sftp_rename_file_internal(config, old_path, new_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_copy_file(
    config: ssh::SSHConnectConfig,
    src_path: String,
    dest_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::sftp_copy_file_internal(config, src_path, dest_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_write_file_bytes(
    config: ssh::SSHConnectConfig,
    file_path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        ssh::sftp_write_file_bytes_internal(config, file_path, data)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_open_in_external_editor(
    config: ssh::SSHConnectConfig,
    remote_path: String,
    editor_id: String,
) -> Result<ssh::OpenEditorResult, String> {
    tokio::task::spawn_blocking(move || {
        ssh::sftp_open_in_external_editor_internal(config, remote_path, editor_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_get_available_editors() -> Result<Vec<ssh::AvailableEditor>, String> {
    tokio::task::spawn_blocking(move || ssh::sftp_get_available_editors_internal())
        .await
        .map_err(|e| format!("Task failed: {}", e))
}

#[tauri::command]
async fn sftp_download_to_local(
    config: ssh::SSHConnectConfig,
    remote_path: String,
    local_dir: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        ssh::sftp_download_to_local_internal(config, remote_path, local_dir)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sftp_upload_local_paths(
    config: ssh::SSHConnectConfig,
    remote_dir: String,
    local_paths: Vec<String>,
) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        ssh::sftp_upload_local_paths_internal(config, remote_dir, local_paths)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn verify_ssh_connection(
    config: ssh::SSHConnectConfig,
) -> Result<ssh::SSHDiagnosticReport, String> {
    tokio::task::spawn_blocking(move || ssh::verify_ssh_connection_internal(config))
        .await
        .map_err(|e| format!("Verification task error: {}", e))
}

#[tauri::command]
async fn verify_channel_connection(
    config: ssh::ChannelConnectConfig,
) -> Result<ssh::SSHDiagnosticReport, String> {
    tokio::task::spawn_blocking(move || ssh::verify_channel_connection_internal(config))
        .await
        .map_err(|e| format!("Channel verification error: {}", e))
}

#[tauri::command]
async fn ssh_check_host_key(
    hostname: String,
    port: u16,
) -> Result<ssh::HostKeyStatus, String> {
    tokio::task::spawn_blocking(move || Ok(ssh::check_host_key_internal(hostname, port)))
        .await
        .map_err(|e| format!("Host key check error: {}", e))?
}

#[tauri::command]
async fn ssh_trust_host_key(
    raw_key_line: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::trust_host_key_internal(raw_key_line))
        .await
        .map_err(|e| format!("Trust host key error: {}", e))?
}

#[tauri::command]
async fn save_secure_credential(
    service: String,
    account: String,
    secret: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::save_secure_credential_internal(service, account, secret))
        .await
        .map_err(|e| format!("Save credential error: {}", e))?
}

#[tauri::command]
async fn get_secure_credential(
    service: String,
    account: String,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || ssh::get_secure_credential_internal(service, account))
        .await
        .map_err(|e| format!("Get credential error: {}", e))?
}

#[tauri::command]
async fn delete_secure_credential(
    service: String,
    account: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ssh::delete_secure_credential_internal(service, account))
        .await
        .map_err(|e| format!("Delete credential error: {}", e))?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ShellHistoryEntry {
    pub id: String,
    pub command: String,
    pub timestamp: i64,
}

#[tauri::command]
fn get_shell_history(limit: Option<usize>) -> Result<Vec<ShellHistoryEntry>, String> {
    let max = limit.unwrap_or(150);
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;

    let zsh_path = home.join(".zsh_history");
    let bash_path = home.join(".bash_history");

    let path = if zsh_path.exists() {
        zsh_path
    } else if bash_path.exists() {
        bash_path
    } else {
        return Ok(Vec::new());
    };

    let content = match std::fs::read(&path) {
        Ok(c) => c,
        Err(_) => return Ok(Vec::new()),
    };
    let text = String::from_utf8_lossy(&content);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let mut entries = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for line in text.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let (cmd, ts) = if trimmed.starts_with(": ") {
            if let Some(semi_pos) = trimmed.find(';') {
                let prefix = &trimmed[2..semi_pos];
                let cmd_part = trimmed[semi_pos + 1..].trim();
                let timestamp_sec = prefix
                    .split(':')
                    .next()
                    .and_then(|s| s.trim().parse::<i64>().ok())
                    .unwrap_or(0);
                let ts_ms = if timestamp_sec > 0 {
                    timestamp_sec * 1000
                } else {
                    now
                };
                (cmd_part, ts_ms)
            } else {
                (trimmed, now)
            }
        } else {
            (trimmed, now)
        };

        if cmd.is_empty() {
            continue;
        }

        if seen.contains(cmd) {
            continue;
        }
        seen.insert(cmd.to_string());

        entries.push(ShellHistoryEntry {
            id: format!("shell-hist-{}", entries.len()),
            command: cmd.to_string(),
            timestamp: ts,
        });

        if entries.len() >= max {
            break;
        }
    }

    Ok(entries)
}

// ─── Main ────────────────────────────────────────────────────────────────────

fn main() {
    let pty_manager = Arc::new(PtyManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            model_status: Mutex::new(ModelStatus::NotDownloaded),
            pty_manager,
        })
        .invoke_handler(tauri::generate_handler![
            create_pty_session,
            write_pty_data,
            resize_pty,
            close_pty_session,
            get_model_status,
            get_downloaded_models,
            download_model,
            delete_model,
            generate_command_llm,
            get_system_info,
            generate_ssh_key,
            verify_ssh_connection,
            verify_channel_connection,
            ssh_check_host_key,
            ssh_trust_host_key,
            save_secure_credential,
            get_secure_credential,
            delete_secure_credential,
            sftp_list_files,
            sftp_read_file,
            sftp_write_file,
            sftp_create_dir,
            sftp_delete_file,
            sftp_rename_file,
            sftp_copy_file,
            sftp_write_file_bytes,
            sftp_open_in_external_editor,
            sftp_get_available_editors,
            sftp_upload_local_paths,
            sftp_download_to_local,
            get_shell_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
