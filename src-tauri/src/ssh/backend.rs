use crate::ssh::credentials::AskpassHelper;
use crate::ssh::error::{SshError, SshErrorKind};
use crate::ssh::host_keys::{HostKeyManager, HostKeyStatus};
use crate::ssh::platform::{expand_tilde, find_executable};
use crate::ssh::sftp::SftpClient;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSHConnectConfig {
    pub hostname: String,
    pub port: Option<u16>,
    pub username: String,
    pub auth_type: String, // "password", "sshKey", "fido2", "passkey"
    pub key_path: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSHDiagnosticReport {
    pub success: bool,
    pub status: String, // "ready", "auth_failed", "unreachable", "invalid_key", "host_key_changed", "error"
    pub message: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub latency_ms: u64,
    pub os_info: Option<String>,
}

pub trait SshBackend: Send + Sync {
    fn verify_connection(&self, config: &SSHConnectConfig) -> Result<SSHDiagnosticReport, SshError>;
    fn open_sftp_client(&self, config: &SSHConnectConfig) -> Result<SftpClient, SshError>;
    #[allow(dead_code)]
    fn build_terminal_command(&self, config: &SSHConnectConfig) -> Result<(String, Vec<String>), SshError>;
}

pub struct OpenSshBackend;

impl OpenSshBackend {
    pub fn new() -> Self {
        Self
    }

    /// Builds common sanitized command-line arguments for system OpenSSH.
    /// Accepts a pre-computed `HostKeyStatus` to avoid redundant ssh-keyscan calls.
    fn build_common_args_with_hk(&self, config: &SSHConnectConfig, hk_status: &HostKeyStatus) -> Result<Vec<String>, SshError> {
        let mut args = Vec::new();

        let port = config.port.unwrap_or(22);
        if port != 22 && port > 0 {
            args.push("-p".to_string());
            args.push(port.to_string());
        }

        // Connection timeout — 5s is sufficient; the TCP probe already confirmed reachability
        args.push("-o".to_string());
        args.push("ConnectTimeout=5".to_string());

        // Apply host key policy from the cached verification result
        match hk_status {
            HostKeyStatus::KeyChanged { current_fingerprint, expected_fingerprint, .. } => {
                return Err(SshError::new(
                    SshErrorKind::HostKeyChanged,
                    format!(
                        "Host key for {}:{} changed! Expected fingerprint {}, but remote host has {}.",
                        config.hostname, port, expected_fingerprint, current_fingerprint
                    ),
                ));
            }
            HostKeyStatus::UntrustedNew { .. } => {
                args.push("-o".to_string());
                args.push("StrictHostKeyChecking=accept-new".to_string());
            }
            _ => {
                args.push("-o".to_string());
                args.push("StrictHostKeyChecking=yes".to_string());
            }
        }

        // Key-based authentication
        if config.auth_type != "password" {
            if let Some(ref key_path) = config.key_path {
                let trimmed = key_path.trim();
                if !trimmed.is_empty() {
                    let expanded = expand_tilde(trimmed);
                    if !expanded.exists() {
                        return Err(SshError::new(
                            SshErrorKind::FileNotFound,
                            format!("SSH private key file not found: {}", expanded.display()),
                        ));
                    }
                    args.push("-i".to_string());
                    args.push(expanded.to_string_lossy().to_string());
                }
            }
        } else {
            // Password auth preferred
            args.push("-o".to_string());
            args.push("PreferredAuthentications=keyboard-interactive,password".to_string());
            args.push("-o".to_string());
            args.push("PubkeyAuthentication=no".to_string());
        }

        Ok(args)
    }

    /// Builds common sanitized command-line arguments for system OpenSSH.
    /// Performs a fresh host key scan (used by SFTP and terminal commands).
    fn build_common_args(&self, config: &SSHConnectConfig) -> Result<Vec<String>, SshError> {
        let port = config.port.unwrap_or(22);
        let hk_status = HostKeyManager::verify_host(&config.hostname, port);
        self.build_common_args_with_hk(config, &hk_status)
    }
}

impl SshBackend for OpenSshBackend {
    /// Non-invasive, read-only diagnostic verification of an SSH endpoint.
    /// Never mutates remote files (no ~/.hushlogin creation).
    fn verify_connection(&self, config: &SSHConnectConfig) -> Result<SSHDiagnosticReport, SshError> {
        let port = config.port.unwrap_or(22);
        let start = Instant::now();

        if config.hostname.trim().is_empty() {
            return Ok(SSHDiagnosticReport {
                success: false,
                status: "error".into(),
                message: "Hostname cannot be empty.".into(),
                hostname: config.hostname.clone(),
                port,
                username: config.username.clone(),
                latency_ms: 0,
                os_info: None,
            });
        }

        // 1. DNS Resolution check
        let addr_str = format!("{}:{}", config.hostname, port);
        let socket_addr = match addr_str.to_socket_addrs() {
            Ok(mut addrs) => match addrs.next() {
                Some(a) => a,
                None => {
                    return Ok(SSHDiagnosticReport {
                        success: false,
                        status: "unreachable".into(),
                        message: format!("Could not resolve hostname '{}'.", config.hostname),
                        hostname: config.hostname.clone(),
                        port,
                        username: config.username.clone(),
                        latency_ms: start.elapsed().as_millis() as u64,
                        os_info: None,
                    });
                }
            },
            Err(e) => {
                return Ok(SSHDiagnosticReport {
                    success: false,
                    status: "unreachable".into(),
                    message: format!("DNS resolution failed for '{}': {}", config.hostname, e),
                    hostname: config.hostname.clone(),
                    port,
                    username: config.username.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: None,
                });
            }
        };

        // 2. TCP Port reachability check (3s connect, 1s banner read)
        let banner = match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(3)) {
            Ok(stream) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
                let mut buf = [0u8; 128];
                let mut s_ver = None;
                if let Ok(n) = (&stream).read(&mut buf) {
                    if n > 0 {
                        let raw = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                        if raw.starts_with("SSH-") {
                            s_ver = Some(raw);
                        }
                    }
                }
                s_ver
            }
            Err(e) => {
                return Ok(SSHDiagnosticReport {
                    success: false,
                    status: "unreachable".into(),
                    message: format!("Connection failed: {}:{} unreachable ({})", config.hostname, port, e),
                    hostname: config.hostname.clone(),
                    port,
                    username: config.username.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: None,
                });
            }
        };

        // 3. Host key check (single scan — result is reused for build_common_args)
        let hk_status = HostKeyManager::verify_host(&config.hostname, port);
        match &hk_status {
            HostKeyStatus::KeyChanged { current_fingerprint, expected_fingerprint, raw_key_line, .. } => {
                return Ok(SSHDiagnosticReport {
                    success: false,
                    status: "host_key_changed".into(),
                    message: format!(
                        "CRITICAL SECURITY ALERT: Server host key has changed! Expected {}, got {}.",
                        expected_fingerprint, current_fingerprint
                    ),
                    hostname: config.hostname.clone(),
                    port,
                    username: config.username.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: Some(raw_key_line.clone()),
                });
            }
            HostKeyStatus::UntrustedNew { fingerprint, key_type, raw_key_line, .. } => {
                return Ok(SSHDiagnosticReport {
                    success: false,
                    status: "untrusted_host_key".into(),
                    message: format!(
                        "The authenticity of host '{}:{}' can't be established.\n{} key fingerprint is {}.",
                        config.hostname, port, key_type, fingerprint
                    ),
                    hostname: config.hostname.clone(),
                    port,
                    username: config.username.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: Some(raw_key_line.clone()),
                });
            }
            _ => {}
        }

        // 4. Non-mutating SSH handshake verification (`uname -srm 2>/dev/null || echo READY`)
        let ssh_bin = match find_executable("ssh") {
            Some(b) => b,
            None => {
                return Ok(SSHDiagnosticReport {
                    success: false,
                    status: "error".into(),
                    message: "OpenSSH executable ('ssh') not found on system PATH.".into(),
                    hostname: config.hostname.clone(),
                    port,
                    username: config.username.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: banner,
                });
            }
        };

        // Reuse the cached hk_status — no second ssh-keyscan
        let common_args = match self.build_common_args_with_hk(config, &hk_status) {
            Ok(a) => a,
            Err(e) => {
                return Ok(SSHDiagnosticReport {
                    success: false,
                    status: "error".into(),
                    message: e.user_friendly_message(),
                    hostname: config.hostname.clone(),
                    port,
                    username: config.username.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: banner,
                });
            }
        };

        // If password authentication and no password was supplied, report ready for interactive terminal login
        if config.auth_type == "password" && config.password.as_deref().unwrap_or("").trim().is_empty() {
            return Ok(SSHDiagnosticReport {
                success: true,
                status: "ready".into(),
                message: format!("Host reachable on port {}. Ready for interactive password login.", port),
                hostname: config.hostname.clone(),
                port,
                username: config.username.clone(),
                latency_ms: start.elapsed().as_millis() as u64,
                os_info: banner,
            });
        }

        let mut cmd = Command::new(ssh_bin);
        cmd.args(&common_args);

        // Askpass support if password is provided
        let _askpass = if config.auth_type == "password" {
            if let Some(ref pass) = config.password {
                if !pass.trim().is_empty() {
                    match AskpassHelper::new(pass) {
                        Ok(helper) => {
                            cmd.arg("-o").arg("BatchMode=no");
                            cmd.arg("-o").arg("NumberOfPasswordPrompts=1");
                            cmd.stdin(Stdio::null());
                            cmd.env("SSH_ASKPASS", &helper.script_path);
                            cmd.env("SSH_ASKPASS_REQUIRE", "force");
                            cmd.env("DISPLAY", ":0"); // OpenSSH requires DISPLAY on Unix
                            Some(helper)
                        }
                        Err(_) => {
                            cmd.arg("-o").arg("BatchMode=yes");
                            None
                        }
                    }
                } else {
                    cmd.arg("-o").arg("BatchMode=yes");
                    None
                }
            } else {
                cmd.arg("-o").arg("BatchMode=yes");
                None
            }
        } else {
            cmd.arg("-o").arg("BatchMode=yes");
            None
        };

        let target = if config.username.is_empty() {
            config.hostname.clone()
        } else {
            format!("{}@{}", config.username, config.hostname)
        };
        cmd.arg(&target);
        // Pure read-only probe
        cmd.arg("uname -srm 2>/dev/null || echo READY");

        let output = match cmd.output() {
            Ok(o) => o,
            Err(e) => {
                return Ok(SSHDiagnosticReport {
                    success: false,
                    status: "error".into(),
                    message: format!("SSH execution error: {}", e),
                    hostname: config.hostname.clone(),
                    port,
                    username: config.username.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    os_info: banner,
                });
            }
        };

        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let os_info = if !out_str.is_empty() && !out_str.contains("READY") {
                Some(out_str.lines().last().unwrap_or("Linux").to_string())
            } else {
                banner
            };

            Ok(SSHDiagnosticReport {
                success: true,
                status: "ready".into(),
                message: format!("Connected and authenticated to {}@{}:{}", config.username, config.hostname, port),
                hostname: config.hostname.clone(),
                port,
                username: config.username.clone(),
                latency_ms: start.elapsed().as_millis() as u64,
                os_info,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
            let is_auth_fail = stderr.contains("permission denied")
                || stderr.contains("authentication failed")
                || stderr.contains("publickey");

            let status = if is_auth_fail { "auth_failed" } else { "error" };
            let message = if is_auth_fail {
                format!("Authentication rejected for user '{}'", config.username)
            } else {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            };

            Ok(SSHDiagnosticReport {
                success: false,
                status: status.into(),
                message,
                hostname: config.hostname.clone(),
                port,
                username: config.username.clone(),
                latency_ms: start.elapsed().as_millis() as u64,
                os_info: banner,
            })
        }
    }

    /// Spawns a real SFTP subsystem session over SSH (ssh -s <host> sftp)
    /// and establishes the SFTP binary wire protocol channel.
    fn open_sftp_client(&self, config: &SSHConnectConfig) -> Result<SftpClient, SshError> {
        let ssh_bin = find_executable("ssh")
            .ok_or_else(|| SshError::new(SshErrorKind::BackendUnavailable, "OpenSSH ('ssh') executable not found"))?;

        let mut cmd = Command::new(ssh_bin);
        let common_args = self.build_common_args(config)?;
        cmd.args(&common_args);

        // Askpass support if password is provided
        let _askpass = if config.auth_type == "password" {
            if let Some(ref pass) = config.password {
                if !pass.trim().is_empty() {
                    let helper = AskpassHelper::new(pass)
                        .map_err(|e| SshError::new(SshErrorKind::Other, format!("Askpass setup failed: {}", e)))?;
                    cmd.env("SSH_ASKPASS", &helper.script_path);
                    cmd.env("SSH_ASKPASS_REQUIRE", "force");
                    cmd.env("DISPLAY", ":0");
                    Some(helper)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let target = if config.username.is_empty() {
            config.hostname.clone()
        } else {
            format!("{}@{}", config.username, config.hostname)
        };
        cmd.arg(&target);
        // Subsystem mode: SFTP protocol over SSH stream
        cmd.arg("-s");
        cmd.arg("sftp");

        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            SshError::new(SshErrorKind::Io, format!("Failed to spawn SSH SFTP subsystem: {}", e))
        })?;

        let stdin = Box::new(child.stdin.take().unwrap());
        let stdout = Box::new(child.stdout.take().unwrap());

        let mut client = SftpClient::new(child, stdin, stdout);
        client.init_handshake()?;

        Ok(client)
    }

    /// Prepares arguments for launching an interactive terminal session in a PTY.
    #[allow(dead_code)]
    fn build_terminal_command(&self, config: &SSHConnectConfig) -> Result<(String, Vec<String>), SshError> {
        let ssh_bin = find_executable("ssh")
            .ok_or_else(|| SshError::new(SshErrorKind::BackendUnavailable, "OpenSSH ('ssh') executable not found"))?;

        let mut args = self.build_common_args(config)?;
        let target = if config.username.is_empty() {
            config.hostname.clone()
        } else {
            format!("{}@{}", config.username, config.hostname)
        };
        args.push(target);

        Ok((ssh_bin.to_string_lossy().to_string(), args))
    }
}
