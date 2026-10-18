pub mod backend;
pub mod credentials;
pub mod editor;
pub mod error;
pub mod host_keys;
pub mod platform;
pub mod sftp;

pub use backend::{OpenSshBackend, SSHConnectConfig, SSHDiagnosticReport, SshBackend};
pub use editor::{get_available_editors, open_in_external_editor, AvailableEditor, OpenEditorResult};
#[allow(unused_imports)]
pub use error::{SshError, SshErrorKind};
pub use host_keys::{HostKeyManager, HostKeyStatus};
pub use platform::{expand_tilde, find_executable, secure_file};
pub use sftp::RemoteFileItem;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedKeyInfo {
    pub name: String,
    pub key_type: String,
    pub private_key_path: String,
    pub public_key_path: String,
    pub public_key_content: String,
    pub fingerprint: String,
    pub is_passkey: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConnectConfig {
    pub protocol: String, // "ssh", "ftp", "telnet", "socket", "raw_tcp"
    pub hostname: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

// ─── Public API Facade for Tauri IPC Commands ────────────────────────────────

pub fn verify_ssh_connection_internal(config: SSHConnectConfig) -> SSHDiagnosticReport {
    let backend = OpenSshBackend::new();
    match backend.verify_connection(&config) {
        Ok(report) => report,
        Err(e) => SSHDiagnosticReport {
            success: false,
            status: "error".into(),
            message: e.user_friendly_message(),
            hostname: config.hostname,
            port: config.port.unwrap_or(22),
            username: config.username,
            latency_ms: 0,
            os_info: None,
        },
    }
}

pub fn verify_channel_connection_internal(config: ChannelConnectConfig) -> SSHDiagnosticReport {
    let proto = config.protocol.to_lowercase();
    let port = if config.port > 0 {
        config.port
    } else {
        match proto.as_str() {
            "ftp" => 21,
            "telnet" => 23,
            "ssh" => 22,
            _ => 80,
        }
    };

    if proto == "ssh" {
        return verify_ssh_connection_internal(SSHConnectConfig {
            hostname: config.hostname,
            port: Some(port),
            username: config.username.unwrap_or_default(),
            auth_type: if config.password.is_some() { "password".into() } else { "sshKey".into() },
            key_path: None,
            password: config.password,
        });
    }

    // Direct read-only TCP banner probe for FTP/Telnet
    use std::io::Read;
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::{Duration, Instant};

    let start = Instant::now();
    let addr_str = format!("{}:{}", config.hostname, port);
    let socket_addr = match addr_str.to_socket_addrs() {
        Ok(mut addrs) => match addrs.next() {
            Some(a) => a,
            None => {
                return SSHDiagnosticReport {
                    success: false,
                    status: "unreachable".into(),
                    message: format!("Could not resolve hostname '{}'.", config.hostname),
                    hostname: config.hostname,
                    port,
                    username: config.username.unwrap_or_default(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: None,
                };
            }
        },
        Err(e) => {
            return SSHDiagnosticReport {
                success: false,
                status: "unreachable".into(),
                message: format!("DNS resolution error for '{}': {}", config.hostname, e),
                hostname: config.hostname,
                port,
                username: config.username.unwrap_or_default(),
                latency_ms: start.elapsed().as_millis() as u64,
                os_info: None,
            };
        }
    };

    match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(4)) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let mut buf = [0u8; 512];
            let mut banner = String::new();
            if let Ok(n) = stream.read(&mut buf) {
                if n > 0 {
                    banner = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                }
            }

            SSHDiagnosticReport {
                success: true,
                status: "ready".into(),
                message: format!("{} service online at {}:{}", proto.to_uppercase(), config.hostname, port),
                hostname: config.hostname,
                port,
                username: config.username.unwrap_or_default(),
                latency_ms: start.elapsed().as_millis() as u64,
                os_info: if !banner.is_empty() { Some(banner) } else { None },
            }
        }
        Err(e) => SSHDiagnosticReport {
            success: false,
            status: "unreachable".into(),
            message: format!("Connection failed: {}:{} unreachable ({})", config.hostname, port, e),
            hostname: config.hostname,
            port,
            username: config.username.unwrap_or_default(),
            latency_ms: start.elapsed().as_millis() as u64,
            os_info: None,
        },
    }
}

pub fn check_host_key_internal(hostname: String, port: u16) -> HostKeyStatus {
    HostKeyManager::verify_host(&hostname, port)
}

pub fn trust_host_key_internal(raw_line: String) -> Result<(), String> {
    HostKeyManager::trust_host_key(&raw_line)
}

pub fn sftp_list_files_internal(config: SSHConnectConfig, remote_path: String) -> Result<Vec<RemoteFileItem>, String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    let path = if remote_path.trim().is_empty() { "/" } else { remote_path.trim() };
    sftp.list_dir(path).map_err(|e| e.user_friendly_message())
}

pub fn sftp_read_file_internal(config: SSHConnectConfig, file_path: String) -> Result<String, String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    let bytes = sftp.read_file(&file_path, 5 * 1024 * 1024).map_err(|e| e.user_friendly_message())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

pub fn sftp_write_file_internal(config: SSHConnectConfig, file_path: String, content: String) -> Result<(), String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    sftp.write_file(&file_path, content.as_bytes(), true)
        .map_err(|e| e.user_friendly_message())
}

pub fn sftp_create_dir_internal(config: SSHConnectConfig, dir_path: String) -> Result<(), String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    sftp.create_dir(&dir_path).map_err(|e| e.user_friendly_message())
}

pub fn sftp_delete_file_internal(config: SSHConnectConfig, target_path: String) -> Result<(), String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    sftp.delete_file(&target_path).map_err(|e| e.user_friendly_message())
}

pub fn sftp_rename_file_internal(config: SSHConnectConfig, old_path: String, new_path: String) -> Result<(), String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    sftp.rename_file(&old_path, &new_path).map_err(|e| e.user_friendly_message())
}

pub fn sftp_copy_file_internal(config: SSHConnectConfig, src_path: String, dest_path: String) -> Result<(), String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    let data = sftp.read_file(&src_path, 20 * 1024 * 1024).map_err(|e| e.user_friendly_message())?;
    sftp.write_file(&dest_path, &data, true).map_err(|e| e.user_friendly_message())
}

pub fn sftp_write_file_bytes_internal(config: SSHConnectConfig, file_path: String, data: Vec<u8>) -> Result<(), String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    sftp.write_file(&file_path, &data, true).map_err(|e| e.user_friendly_message())
}

pub fn sftp_upload_local_paths_internal(
    config: SSHConnectConfig,
    remote_dir: String,
    local_paths: Vec<String>,
) -> Result<usize, String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;
    let mut uploaded = 0;
    let clean_dir = remote_dir.trim_end_matches('/');

    for path_str in local_paths {
        let p = std::path::Path::new(&path_str);
        if !p.exists() {
            continue;
        }

        let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("file");
        let dest_path = if clean_dir.is_empty() {
            format!("/{}", fname)
        } else {
            format!("{}/{}", clean_dir, fname)
        };

        if p.is_dir() {
            let _ = sftp.create_dir(&dest_path);
            if let Ok(entries) = fs::read_dir(p) {
                let sub_paths: Vec<String> = entries
                    .filter_map(|e| e.ok().map(|de| de.path().to_string_lossy().to_string()))
                    .collect();
                let _ = sftp_upload_local_paths_internal(config.clone(), dest_path, sub_paths);
            }
            uploaded += 1;
        } else {
            if let Ok(bytes) = fs::read(p) {
                sftp.write_file(&dest_path, &bytes, true).map_err(|e| e.user_friendly_message())?;
                uploaded += 1;
            }
        }
    }

    Ok(uploaded)
}

pub fn sftp_download_to_local_internal(
    config: SSHConnectConfig,
    remote_path: String,
    local_dir: Option<String>,
) -> Result<String, String> {
    let backend = OpenSshBackend::new();
    let mut sftp = backend.open_sftp_client(&config).map_err(|e| e.user_friendly_message())?;

    let target_dir = match local_dir {
        Some(ref d) if !d.trim().is_empty() => PathBuf::from(d.trim()),
        _ => dirs::download_dir()
            .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
            .unwrap_or_else(std::env::temp_dir),
    };

    if !target_dir.exists() {
        let _ = fs::create_dir_all(&target_dir);
    }

    let filename = remote_path
        .split('/')
        .filter(|s| !s.is_empty())
        .last()
        .unwrap_or("download");

    let local_path = target_dir.join(filename);

    let attr = sftp.stat_file(&remote_path).ok();
    let is_dir = attr.map(|a| a.is_dir()).unwrap_or(false);

    if is_dir {
        let _ = fs::create_dir_all(&local_path);
        let entries = sftp.list_dir(&remote_path).map_err(|e| e.user_friendly_message())?;
        drop(sftp);
        for entry in entries {
            let child_remote = entry.path.clone();
            let child_local_dir = local_path.to_string_lossy().to_string();
            sftp_download_to_local_internal(
                config.clone(),
                child_remote,
                Some(child_local_dir),
            )?;
        }
    } else {
        let data = sftp.read_file(&remote_path, 100 * 1024 * 1024)
            .map_err(|e| e.user_friendly_message())?;
        fs::write(&local_path, &data)
            .map_err(|e| format!("Failed to write local file: {}", e))?;
    }

    Ok(local_path.to_string_lossy().to_string())
}

pub fn sftp_open_in_external_editor_internal(
    config: SSHConnectConfig,
    remote_path: String,
    editor_id: String,
) -> Result<OpenEditorResult, String> {
    open_in_external_editor(config, remote_path, editor_id).map_err(|e| e.user_friendly_message())
}

pub fn sftp_get_available_editors_internal() -> Vec<AvailableEditor> {
    get_available_editors()
}

/// Generates a real SSH key or FIDO2 Security Key with verified permissions and safe cleanup on failure.
pub fn generate_ssh_key_internal(
    name: &str,
    key_type: &str,
    target_path: Option<String>,
    passphrase: Option<String>,
    comment: Option<String>,
    resident: bool,
) -> Result<GeneratedKeyInfo, String> {
    let keygen_bin = find_executable("ssh-keygen")
        .ok_or_else(|| "ssh-keygen executable not found on system PATH".to_string())?;

    let home = dirs::home_dir().ok_or_else(|| "Could not locate user home directory".to_string())?;
    let ssh_dir = home.join(".ssh");
    if !ssh_dir.exists() {
        let _ = fs::create_dir_all(&ssh_dir);
    }

    let default_filename = match key_type.to_lowercase().as_str() {
        "ed25519-sk" | "fido2-ed25519" | "passkey" => "id_ed25519_sk",
        "ecdsa-sk" | "fido2-ecdsa" => "id_ecdsa_sk",
        "rsa" | "rsa-4096" => "id_rsa",
        "ecdsa" => "id_ecdsa",
        _ => "id_ed25519",
    };

    let base_name = if name.trim().is_empty() {
        default_filename.to_string()
    } else {
        name.trim().replace(' ', "_")
    };

    let key_file_path = match target_path {
        Some(ref p) if !p.trim().is_empty() => expand_tilde(p.trim()),
        _ => ssh_dir.join(&base_name),
    };

    let pub_file_path = PathBuf::from(format!("{}.pub", key_file_path.display()));

    // Never overwrite an existing key file silently
    if key_file_path.exists() {
        return Err(format!("Key file '{}' already exists. Choose a different name or path.", key_file_path.display()));
    }

    let is_passkey = key_type.contains("sk") || key_type.contains("fido2") || key_type.contains("passkey");
    let actual_keygen_type = match key_type.to_lowercase().as_str() {
        "ed25519-sk" | "fido2-ed25519" | "passkey" => "ed25519-sk",
        "ecdsa-sk" | "fido2-ecdsa" => "ecdsa-sk",
        "rsa" | "rsa-4096" => "rsa",
        "ecdsa" => "ecdsa",
        _ => "ed25519",
    };

    let effective_comment = comment.unwrap_or_else(|| format!("{}@myterminal", base_name));
    let effective_passphrase = passphrase.unwrap_or_default();

    let mut cmd = Command::new(keygen_bin);
    cmd.arg("-t").arg(actual_keygen_type);
    cmd.arg("-C").arg(&effective_comment);
    cmd.arg("-N").arg(&effective_passphrase);
    cmd.arg("-f").arg(&key_file_path);

    if actual_keygen_type == "rsa" {
        cmd.arg("-b").arg("4096");
    }

    if is_passkey && resident {
        cmd.arg("-O").arg("resident");
    }

    let output = cmd.output().map_err(|e| format!("ssh-keygen execution failed: {}", e))?;

    if !output.status.success() {
        // Clean up partial artifacts if created
        let _ = fs::remove_file(&key_file_path);
        let _ = fs::remove_file(&pub_file_path);

        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_passkey {
            return Err(format!(
                "FIDO2 Security Key generation failed: {}. Ensure your hardware security key is plugged in and touched.",
                stderr.trim()
            ));
        }
        return Err(format!("ssh-keygen failed: {}", stderr.trim()));
    }

    // Set restrictive permissions on the private key file (0600 on Unix)
    let _ = secure_file(&key_file_path);

    // Read generated public key
    let public_key_content = match fs::read_to_string(&pub_file_path) {
        Ok(c) => c.trim().to_string(),
        Err(e) => {
            // Rollback on read failure
            let _ = fs::remove_file(&key_file_path);
            let _ = fs::remove_file(&pub_file_path);
            return Err(format!("Failed to read generated public key: {}", e));
        }
    };

    // Calculate fingerprint
    let fp_output = Command::new(find_executable("ssh-keygen").unwrap())
        .arg("-l")
        .arg("-f")
        .arg(&pub_file_path)
        .output();

    let fingerprint = match fp_output {
        Ok(out) if out.status.success() => {
            let fp_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            fp_str.split_whitespace().nth(1).unwrap_or(&fp_str).to_string()
        }
        _ => "SHA256:unknown".to_string(),
    };

    Ok(GeneratedKeyInfo {
        name: base_name,
        key_type: actual_keygen_type.to_uppercase(),
        private_key_path: key_file_path.to_string_lossy().to_string(),
        public_key_path: pub_file_path.to_string_lossy().to_string(),
        public_key_content,
        fingerprint,
        is_passkey,
    })
}

pub fn save_secure_credential_internal(service: String, account: String, secret: String) -> Result<(), String> {
    crate::ssh::credentials::SecureVault::store_secret(&service, &account, &secret)
}

pub fn get_secure_credential_internal(service: String, account: String) -> Result<Option<String>, String> {
    crate::ssh::credentials::SecureVault::get_secret(&service, &account)
}

pub fn delete_secure_credential_internal(service: String, account: String) -> Result<(), String> {
    crate::ssh::credentials::SecureVault::delete_secret(&service, &account)
}

