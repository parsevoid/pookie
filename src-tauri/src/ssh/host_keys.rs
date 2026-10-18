use crate::ssh::platform::{find_executable, secure_file};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", content = "data")]
pub enum HostKeyStatus {
    Trusted {
        fingerprint: String,
        key_type: String,
    },
    UntrustedNew {
        hostname: String,
        port: u16,
        fingerprint: String,
        key_type: String,
        raw_key_line: String,
    },
    KeyChanged {
        hostname: String,
        port: u16,
        current_fingerprint: String,
        expected_fingerprint: String,
        key_type: String,
        raw_key_line: String,
    },
    Unavailable {
        message: String,
    },
}

pub struct HostKeyManager;

impl HostKeyManager {
    pub fn get_known_hosts_path() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".ssh").join("known_hosts"))
    }

    /// Fetches the public key from the remote SSH server using ssh-keyscan.
    pub fn scan_remote_key(hostname: &str, port: u16) -> Result<(String, String, String), String> {
        let keyscan_bin = find_executable("ssh-keyscan")
            .ok_or_else(|| "ssh-keyscan utility not found on this system".to_string())?;

        let mut cmd = Command::new(keyscan_bin);
        cmd.arg("-p").arg(port.to_string());
        cmd.arg("-T").arg("3"); // 3s timeout (host already confirmed reachable)
        cmd.arg(hostname);

        let output = cmd.output().map_err(|e| format!("ssh-keyscan failed: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout);

        // Find the first valid host key line (prefer ed25519 or ecdsa, then rsa)
        let lines: Vec<&str> = stdout.lines().filter(|l| !l.starts_with('#') && !l.trim().is_empty()).collect();
        if lines.is_empty() {
            return Err(format!("Could not retrieve host key from {}:{}", hostname, port));
        }

        let best_line = lines
            .iter()
            .find(|l| l.contains("ssh-ed25519"))
            .or_else(|| lines.iter().find(|l| l.contains("ecdsa-sha2-nistp256")))
            .or_else(|| lines.first())
            .unwrap();

        let parts: Vec<&str> = best_line.split_whitespace().collect();
        if parts.len() < 3 {
            return Err("Unexpected host key format from ssh-keyscan".to_string());
        }

        let key_type = parts[1].to_string();

        // Calculate SHA256 fingerprint using ssh-keygen -l
        let fingerprint = Self::calculate_fingerprint_from_line(best_line)?;

        Ok((key_type, fingerprint, best_line.to_string()))
    }

    /// Calculates SHA256 fingerprint from a known_hosts line using ssh-keygen.
    fn calculate_fingerprint_from_line(line: &str) -> Result<String, String> {
        let temp_file = std::env::temp_dir().join(format!(
            "hk_{}.pub",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));

        fs::write(&temp_file, line.as_bytes()).map_err(|e| e.to_string())?;

        let keygen_bin = find_executable("ssh-keygen")
            .ok_or_else(|| "ssh-keygen utility not found".to_string())?;

        let output = Command::new(keygen_bin)
            .arg("-l")
            .arg("-f")
            .arg(&temp_file)
            .output();

        let _ = fs::remove_file(&temp_file);

        match output {
            Ok(out) if out.status.success() => {
                let out_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let fp = out_str.split_whitespace().nth(1).unwrap_or(&out_str).to_string();
                Ok(fp)
            }
            _ => Err("Failed to compute fingerprint of remote host key".to_string()),
        }
    }

    /// Evaluates whether the host is trusted, new, or changed.
    pub fn verify_host(hostname: &str, port: u16) -> HostKeyStatus {
        let (key_type, remote_fp, raw_line) = match Self::scan_remote_key(hostname, port) {
            Ok(res) => res,
            Err(e) => return HostKeyStatus::Unavailable { message: e },
        };

        let known_hosts_path = match Self::get_known_hosts_path() {
            Some(p) => p,
            None => {
                return HostKeyStatus::UntrustedNew {
                    hostname: hostname.to_string(),
                    port,
                    fingerprint: remote_fp,
                    key_type,
                    raw_key_line: raw_line,
                }
            }
        };

        if !known_hosts_path.exists() {
            return HostKeyStatus::UntrustedNew {
                hostname: hostname.to_string(),
                port,
                fingerprint: remote_fp,
                key_type,
                raw_key_line: raw_line,
            };
        }

        // Query existing entry via ssh-keygen -F
        let keygen_bin = match find_executable("ssh-keygen") {
            Some(b) => b,
            None => {
                return HostKeyStatus::UntrustedNew {
                    hostname: hostname.to_string(),
                    port,
                    fingerprint: remote_fp,
                    key_type,
                    raw_key_line: raw_line,
                }
            }
        };

        let host_pattern = if port == 22 {
            hostname.to_string()
        } else {
            format!("[{}]:{}", hostname, port)
        };

        let check_res = Command::new(keygen_bin)
            .arg("-F")
            .arg(&host_pattern)
            .arg("-f")
            .arg(&known_hosts_path)
            .output();

        match check_res {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let matching_lines: Vec<&str> = stdout
                    .lines()
                    .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
                    .collect();

                if matching_lines.is_empty() {
                    HostKeyStatus::UntrustedNew {
                        hostname: hostname.to_string(),
                        port,
                        fingerprint: remote_fp,
                        key_type,
                        raw_key_line: raw_line,
                    }
                } else {
                    // Check if any matching entry has the same fingerprint
                    for line in &matching_lines {
                        if let Ok(known_fp) = Self::calculate_fingerprint_from_line(line) {
                            if known_fp == remote_fp {
                                return HostKeyStatus::Trusted {
                                    fingerprint: remote_fp,
                                    key_type,
                                };
                            }
                        }
                    }

                    // Matching host found, but with a different fingerprint -> Host Key Changed!
                    let old_fp = matching_lines
                        .first()
                        .and_then(|l| Self::calculate_fingerprint_from_line(l).ok())
                        .unwrap_or_else(|| "UNKNOWN".to_string());

                    HostKeyStatus::KeyChanged {
                        hostname: hostname.to_string(),
                        port,
                        current_fingerprint: remote_fp,
                        expected_fingerprint: old_fp,
                        key_type,
                        raw_key_line: raw_line,
                    }
                }
            }
            _ => HostKeyStatus::UntrustedNew {
                hostname: hostname.to_string(),
                port,
                fingerprint: remote_fp,
                key_type,
                raw_key_line: raw_line,
            },
        }
    }

    /// User explicitly approves a new host key -> safely appends to ~/.ssh/known_hosts.
    pub fn trust_host_key(raw_line: &str) -> Result<(), String> {
        let known_hosts_path = Self::get_known_hosts_path()
            .ok_or_else(|| "Could not locate home directory".to_string())?;

        if let Some(parent) = known_hosts_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&known_hosts_path)
            .map_err(|e| format!("Failed to open known_hosts: {}", e))?;

        writeln!(file, "{}", raw_line.trim())
            .map_err(|e| format!("Failed to write to known_hosts: {}", e))?;

        let _ = secure_file(&known_hosts_path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_host_key_status_serialization() {
        let status = HostKeyStatus::KeyChanged {
            hostname: "example.com".to_string(),
            port: 22,
            current_fingerprint: "SHA256:abc123def456".to_string(),
            expected_fingerprint: "SHA256:old999expected".to_string(),
            key_type: "ssh-ed25519".to_string(),
            raw_key_line: "example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...".to_string(),
        };

        let json = serde_json::to_string(&status).expect("Failed to serialize");
        assert!(json.contains("KeyChanged"));
        assert!(json.contains("example.com"));
        assert!(json.contains("SHA256:abc123def456"));
    }
}

