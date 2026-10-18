// PTY Module for MyTerminal
// Provides real cross-platform pseudo-terminal sessions using portable-pty.
// Upgraded with managed child lifecycles, streaming lossless UTF-8 decoding,
// per-session write concurrency, and strict generation isolation.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Emitter;

pub struct PtySession {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub child: Arc<Mutex<Box<dyn Child + Send>>>,
    pub generation: u64,
    pub _askpass: Option<crate::ssh::credentials::AskpassHelper>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    generation_counter: Arc<AtomicU64>,
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            generation_counter: Arc::new(AtomicU64::new(1)),
        }
    }

    /// Validates session ID format to ensure safe Tauri event dispatch.
    fn validate_session_id(id: &str) -> Result<(), String> {
        if id.is_empty() || id.len() > 128 {
            return Err("Session ID must be between 1 and 128 characters".to_string());
        }
        if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            return Err("Session ID must contain only alphanumeric characters, dashes, or underscores".to_string());
        }
        Ok(())
    }

    pub fn create_session(
        &self,
        app: tauri::AppHandle,
        id: String,
        command: Option<String>,
        args: Option<Vec<String>>,
        cols: u16,
        rows: u16,
        env: Option<HashMap<String, String>>,
        password: Option<String>,
    ) -> Result<(), String> {
        Self::validate_session_id(&id)?;

        // 1. Terminate and clean up any existing session for this tab ID
        {
            let mut sessions = self.sessions.lock().unwrap();
            if let Some(old_sess) = sessions.remove(&id) {
                if let Ok(mut child) = old_sess.child.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows.max(10),
                cols: cols.max(20),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell = if let Some(cmd) = command {
            cmd
        } else if cfg!(windows) {
            std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        };

        let mut cmd = CommandBuilder::new(&shell);
        if let Some(cmd_args) = args {
            for arg in cmd_args {
                if arg.starts_with("~/") {
                    if let Some(home) = dirs::home_dir() {
                        let expanded = home.join(&arg[2..]).to_string_lossy().to_string();
                        cmd.arg(expanded);
                        continue;
                    }
                }
                cmd.arg(arg);
            }
        } else if shell.ends_with("zsh") || shell.ends_with("bash") {
            cmd.arg("-l");
        }

        // Environment variables
        if let Some(home) = dirs::home_dir() {
            cmd.cwd(&home);
            let home_str = home.to_string_lossy().to_string();
            cmd.env("HOME", &home_str);
            if shell.ends_with("zsh") {
                let zsh_hist = home.join(".zsh_history");
                cmd.env("HISTFILE", zsh_hist.to_string_lossy().to_string());
                cmd.env("HISTSIZE", "50000");
                cmd.env("SAVEHIST", "50000");
            } else if shell.ends_with("bash") {
                let bash_hist = home.join(".bash_history");
                cmd.env("HISTFILE", bash_hist.to_string_lossy().to_string());
                cmd.env("HISTSIZE", "50000");
            }
        }

        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        } else {
            cmd.env("PATH", "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin");
        }

        if let Ok(user) = std::env::var("USER") {
            cmd.env("USER", user);
        }

        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("SHELL_SESSIONS_DISABLE", "1");

        // Askpass support if password provided
        let askpass_helper = if let Some(ref pass) = password {
            if !pass.trim().is_empty() {
                match crate::ssh::credentials::AskpassHelper::new(pass) {
                    Ok(helper) => {
                        cmd.env("SSH_ASKPASS", &helper.script_path);
                        cmd.env("SSH_ASKPASS_REQUIRE", "force");
                        cmd.env("DISPLAY", ":0");
                        Some(helper)
                    }
                    Err(_) => None,
                }
            } else {
                None
            }
        } else {
            None
        };

        if let Some(custom_env) = env {
            for (k, v) in custom_env {
                cmd.env(k, v);
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell ({}): {}", shell, e))?;

        // Drop slave side in parent process so EOF propagates correctly
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let generation = self.generation_counter.fetch_add(1, Ordering::SeqCst);
        let session_id = id.clone();
        let app_handle = app.clone();
        let sessions_for_thread = Arc::clone(&self.sessions);

        let session = PtySession {
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            child: Arc::new(Mutex::new(child)),
            generation,
            _askpass: askpass_helper,
        };

        // 2. Register session state BEFORE spawning background threads to avoid races
        {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.insert(id, session);
        }

        // 3. Dedicated reader thread with streaming lossless UTF-8 boundary decoder
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut utf8_decoder = StreamingUtf8Decoder::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        // Check if session generation is still valid
                        let is_active = {
                            let sessions = sessions_for_thread.lock().unwrap();
                            sessions
                                .get(&session_id)
                                .map(|s| s.generation == generation)
                                .unwrap_or(false)
                        };
                        if !is_active {
                            break;
                        }

                        let text = utf8_decoder.decode(&buf[..n]);
                        if !text.is_empty() {
                            let event_name = format!("pty-data-{}", session_id);
                            let _ = app_handle.emit(&event_name, text);
                        }
                    }
                    Err(_) => break,
                }
            }

            if let Some(flush_text) = utf8_decoder.flush() {
                let event_name = format!("pty-data-{}", session_id);
                let _ = app_handle.emit(&event_name, flush_text);
            }

            // Only emit exit event if this session generation is still active
            let should_emit = {
                let mut sessions = sessions_for_thread.lock().unwrap();
                if let Some(sess) = sessions.get(&session_id) {
                    if sess.generation == generation {
                        if let Ok(mut child) = sess.child.lock() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                        sessions.remove(&session_id);
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            };

            if should_emit {
                let exit_event = format!("pty-exit-{}", session_id);
                let _ = app_handle.emit(&exit_event, ());
            }
        });

        Ok(())
    }

    pub fn write_data(&self, id: &str, data: &str) -> Result<(), String> {
        let writer_arc = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .get(id)
                .map(|s| Arc::clone(&s.writer))
                .ok_or_else(|| format!("PTY session '{}' not found", id))?
        };

        let mut writer = writer_arc
            .lock()
            .map_err(|_| "Failed to acquire PTY writer lock".to_string())?;

        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;

        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let master_arc = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .get(id)
                .map(|s| Arc::clone(&s.master))
                .ok_or_else(|| format!("PTY session '{}' not found", id))?
        };

        let master = master_arc
            .lock()
            .map_err(|_| "Failed to acquire PTY master lock".to_string())?;

        master
            .resize(PtySize {
                rows: rows.max(10),
                cols: cols.max(20),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;

        Ok(())
    }

    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.remove(id) {
            if let Ok(mut child) = session.child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn close_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for (_, session) in sessions.drain() {
            if let Ok(mut child) = session.child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Helper struct for streaming lossless UTF-8 decoding across arbitrary chunk boundaries.
pub struct StreamingUtf8Decoder {
    carry: Vec<u8>,
}

impl StreamingUtf8Decoder {
    pub fn new() -> Self {
        Self {
            carry: Vec::with_capacity(4),
        }
    }

    pub fn decode(&mut self, bytes: &[u8]) -> String {
        let mut combined = Vec::with_capacity(self.carry.len() + bytes.len());
        combined.extend_from_slice(&self.carry);
        combined.extend_from_slice(bytes);
        self.carry.clear();

        let incomplete = find_incomplete_utf8_suffix(&combined);
        let valid_len = combined.len() - incomplete;

        if incomplete > 0 {
            self.carry.extend_from_slice(&combined[valid_len..]);
        }

        String::from_utf8_lossy(&combined[..valid_len]).to_string()
    }

    pub fn flush(&mut self) -> Option<String> {
        if !self.carry.is_empty() {
            let s = String::from_utf8_lossy(&self.carry).to_string();
            self.carry.clear();
            Some(s)
        } else {
            None
        }
    }
}

/// Identifies if the end of a byte slice terminates on an incomplete UTF-8 sequence,
/// returning the number of incomplete bytes (1 to 3) at the end.
fn find_incomplete_utf8_suffix(bytes: &[u8]) -> usize {
    let len = bytes.len();
    for i in 1..=len.min(4) {
        let b = bytes[len - i];
        if (b & 0x80) == 0 {
            // ASCII single byte, fully complete
            return 0;
        } else if (b & 0xC0) == 0xC0 {
            // Lead byte found!
            let needed = if (b & 0xE0) == 0xC0 {
                2
            } else if (b & 0xF0) == 0xE0 {
                3
            } else if (b & 0xF8) == 0xF0 {
                4
            } else {
                return 0;
            };

            return if i < needed { i } else { 0 };
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_streaming_utf8_boundary_decoder() {
        let mut decoder = StreamingUtf8Decoder::new();

        // 🚀 rocket emoji is 4 bytes: [0xF0, 0x9F, 0x99, 0x80]
        let emoji_bytes = [0xF0, 0x9F, 0x99, 0x80];

        // Split across two chunks
        let chunk1 = &emoji_bytes[0..2]; // incomplete
        let chunk2 = &emoji_bytes[2..4]; // completion

        let out1 = decoder.decode(chunk1);
        assert_eq!(out1, "", "First incomplete chunk must not emit replacement char");

        let out2 = decoder.decode(chunk2);
        assert_eq!(out2, "🚀", "Completed chunk must emit intact emoji");
    }

    #[test]
    fn test_session_id_validation() {
        assert!(PtyManager::validate_session_id("tab-1").is_ok());
        assert!(PtyManager::validate_session_id("session_123").is_ok());
        assert!(PtyManager::validate_session_id("").is_err());
        assert!(PtyManager::validate_session_id("tab;rm -rf").is_err());
        assert!(PtyManager::validate_session_id("tab space").is_err());
    }
}
