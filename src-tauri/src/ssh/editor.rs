use crate::ssh::backend::{OpenSshBackend, SSHConnectConfig, SshBackend};
use crate::ssh::error::{SshError, SshErrorKind};
use crate::ssh::platform::{find_executable, open_or_reveal_file, secure_directory, secure_file};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenEditorResult {
    pub local_path: String,
    pub editor_name: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableEditor {
    pub id: String,
    pub name: String,
    pub is_available: bool,
}

pub fn get_available_editors() -> Vec<AvailableEditor> {
    let mut editors = Vec::new();

    let has_vscode = find_executable("code").is_some()
        || Path::new("/Applications/Visual Studio Code.app").exists();
    editors.push(AvailableEditor {
        id: "vscode".into(),
        name: "Visual Studio Code".into(),
        is_available: has_vscode,
    });

    let has_cursor = find_executable("cursor").is_some()
        || Path::new("/Applications/Cursor.app").exists();
    editors.push(AvailableEditor {
        id: "cursor".into(),
        name: "Cursor AI".into(),
        is_available: has_cursor,
    });

    let has_sublime = find_executable("subl").is_some()
        || Path::new("/Applications/Sublime Text.app").exists();
    editors.push(AvailableEditor {
        id: "sublime".into(),
        name: "Sublime Text".into(),
        is_available: has_sublime,
    });

    let has_textedit = Path::new("/System/Applications/TextEdit.app").exists()
        || Path::new("/Applications/TextEdit.app").exists();
    editors.push(AvailableEditor {
        id: "textedit".into(),
        name: "TextEdit".into(),
        is_available: has_textedit,
    });

    editors.push(AvailableEditor {
        id: "system".into(),
        name: "System Default App".into(),
        is_available: true,
    });

    editors
}

/// Downloads remote file via SFTP, writes to a secured temp folder (0700 permissions),
/// opens with the selected application, and runs a conflict-aware background watcher.
pub fn open_in_external_editor(
    config: SSHConnectConfig,
    remote_path: String,
    editor_id: String,
) -> Result<OpenEditorResult, SshError> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config)?;

    // 1. Fetch remote file stat and content
    let initial_attr = sftp.stat_file(&remote_path).ok();
    let initial_mtime = initial_attr.as_ref().and_then(|a| a.mtime);
    let content = sftp.read_file(&remote_path, 10 * 1024 * 1024)?; // up to 10MB

    // 2. Prepare secured local cache directory
    let temp_dir = std::env::temp_dir().join("myterminal_editor_cache");
    let _ = fs::create_dir_all(&temp_dir);
    let _ = secure_directory(&temp_dir);

    let host_slug = format!("{}_{}", config.username, config.hostname);
    let host_cache_dir = temp_dir.join(&host_slug);
    let _ = fs::create_dir_all(&host_cache_dir);
    let _ = secure_directory(&host_cache_dir);

    let filename = remote_path.split('/').filter(|s| !s.is_empty()).last().unwrap_or("file.txt");
    let local_file = host_cache_dir.join(filename);

    fs::write(&local_file, &content).map_err(|e| SshError::new(SshErrorKind::Io, e.to_string()))?;
    let _ = secure_file(&local_file);

    let local_path_str = local_file.to_string_lossy().to_string();

    // 3. Launch the chosen editor
    let editor_name = match editor_id.as_str() {
        "reveal" => {
            open_or_reveal_file(&local_file, true)
                .map_err(|e| SshError::new(SshErrorKind::Other, e))?;
            "Finder / Explorer"
        }
        "vscode" => {
            if let Some(bin) = find_executable("code") {
                let _ = Command::new(bin).arg(&local_path_str).spawn();
            } else {
                open_or_reveal_file(&local_file, false)
                    .map_err(|e| SshError::new(SshErrorKind::Other, e))?;
            }
            "Visual Studio Code"
        }
        "cursor" => {
            if let Some(bin) = find_executable("cursor") {
                let _ = Command::new(bin).arg(&local_path_str).spawn();
            } else {
                open_or_reveal_file(&local_file, false)
                    .map_err(|e| SshError::new(SshErrorKind::Other, e))?;
            }
            "Cursor"
        }
        "sublime" => {
            if let Some(bin) = find_executable("subl") {
                let _ = Command::new(bin).arg(&local_path_str).spawn();
            } else {
                open_or_reveal_file(&local_file, false)
                    .map_err(|e| SshError::new(SshErrorKind::Other, e))?;
            }
            "Sublime Text"
        }
        _ => {
            open_or_reveal_file(&local_file, false)
                .map_err(|e| SshError::new(SshErrorKind::Other, e))?;
            "OS Default Application"
        }
    };

    // 4. Background file-watcher with remote conflict check
    let watcher_local = local_file.clone();
    let watcher_remote = remote_path;
    let watcher_config = config;

    thread::spawn(move || {
        let mut last_local_mtime = fs::metadata(&watcher_local).and_then(|m| m.modified()).ok();
        let mut last_synced_remote_mtime = initial_mtime;
        let start = Instant::now();

        // Active watcher for up to 2 hours
        while start.elapsed() < Duration::from_secs(7200) {
            thread::sleep(Duration::from_millis(1500));

            if let Ok(meta) = fs::metadata(&watcher_local) {
                if let Ok(current_local_mtime) = meta.modified() {
                    if last_local_mtime.is_some() && Some(current_local_mtime) != last_local_mtime {
                        last_local_mtime = Some(current_local_mtime);

                        if let Ok(new_bytes) = fs::read(&watcher_local) {
                            let backend = OpenSshBackend::new();
                            if let Ok(mut sftp) = backend.open_sftp_client(&watcher_config) {
                                // Conflict detection: check if remote file was modified by another process
                                let remote_current_mtime = sftp.stat_file(&watcher_remote).ok().and_then(|a| a.mtime);
                                if remote_current_mtime > last_synced_remote_mtime && last_synced_remote_mtime.is_some() {
                                    eprintln!(
                                        "Warning: remote file '{}' was modified externally! Conflict detected, halting automatic sync.",
                                        watcher_remote
                                    );
                                    break;
                                }

                                // Atomic write back
                                if let Ok(_) = sftp.write_file(&watcher_remote, &new_bytes, true) {
                                    last_synced_remote_mtime = sftp.stat_file(&watcher_remote).ok().and_then(|a| a.mtime);
                                }
                            }
                        }
                    } else if last_local_mtime.is_none() {
                        last_local_mtime = Some(current_local_mtime);
                    }
                }
            } else {
                break; // Local file deleted
            }
        }
    });

    Ok(OpenEditorResult {
        local_path: local_path_str,
        editor_name: editor_name.to_string(),
        success: true,
    })
}
