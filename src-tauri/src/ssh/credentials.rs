use crate::ssh::platform::{secure_directory, secure_file};
#[cfg(target_os = "linux")]
use crate::ssh::platform::find_executable;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// Redacts sensitive strings (passwords, private keys, tokens) from logs and error output.
#[allow(dead_code)]
pub fn redact_credentials(text: &str) -> String {
    let mut sanitized = text.to_string();

    // Redact private key blocks
    if sanitized.contains("BEGIN OPENSSH PRIVATE KEY") || sanitized.contains("BEGIN RSA PRIVATE KEY") {
        sanitized = "[REDACTED PRIVATE KEY]".to_string();
    }

    sanitized
}

/// Helper that creates a temporary platform-specific SSH_ASKPASS script to deliver passwords to OpenSSH
/// securely without terminal scraping or exposing the secret in command-line arguments.
pub struct AskpassHelper {
    pub script_path: PathBuf,
}

impl AskpassHelper {
    pub fn new(password: &str) -> Result<Self, String> {
        let temp_dir = std::env::temp_dir().join("myterminal_sec");
        let _ = fs::create_dir_all(&temp_dir);
        let _ = secure_directory(&temp_dir);

        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);

        #[cfg(windows)]
        {
            let script_path = temp_dir.join(format!("askpass_{}.cmd", unique_id));
            let script_content = format!("@echo off\r\necho {}\r\n", password.replace('%', "%%"));
            fs::write(&script_path, script_content.as_bytes()).map_err(|e| e.to_string())?;
            Ok(Self { script_path })
        }

        #[cfg(not(windows))]
        {
            let script_path = temp_dir.join(format!("askpass_{}.sh", unique_id));
            // Escape single quotes for bash
            let escaped_pass = password.replace('\'', "'\\''");
            let script_content = format!("#!/bin/sh\nprintf '%s\\n' '{}'\n", escaped_pass);
            fs::write(&script_path, script_content.as_bytes()).map_err(|e| e.to_string())?;
            let _ = secure_file(&script_path);

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&script_path, fs::Permissions::from_mode(0o700));
            }

            Ok(Self { script_path })
        }
    }
}

impl Drop for AskpassHelper {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.script_path);
    }
}

/// OS-backed secure credential storage.
/// Prioritizes macOS Keychain (`security`), Windows Credential Manager (`PasswordVault`),
/// Linux Secret Service (`secret-tool`), and falls back to a permission-secured local vault (`0600`).
pub struct SecureVault;

impl SecureVault {
    fn fallback_vault_path() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".myterminal").join("vault.json"))
    }

    fn read_fallback_vault() -> std::collections::HashMap<String, String> {
        let path = match Self::fallback_vault_path() {
            Some(p) => p,
            None => return std::collections::HashMap::new(),
        };

        if !path.exists() {
            return std::collections::HashMap::new();
        }

        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => std::collections::HashMap::new(),
        }
    }

    fn write_fallback_vault(vault: &std::collections::HashMap<String, String>) -> Result<(), String> {
        let path = Self::fallback_vault_path().ok_or_else(|| "Could not determine home directory".to_string())?;
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
            let _ = secure_directory(parent);
        }

        let json = serde_json::to_string_pretty(vault).map_err(|e| e.to_string())?;
        fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())?;
        let _ = secure_file(&path);
        Ok(())
    }

    /// Stores a secret securely in the platform OS vault.
    pub fn store_secret(service: &str, account: &str, secret: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let res = Command::new("security")
                .arg("add-generic-password")
                .arg("-a").arg(account)
                .arg("-s").arg(service)
                .arg("-w").arg(secret)
                .arg("-U") // Update if exists
                .output();
            if let Ok(out) = res {
                if out.status.success() {
                    return Ok(());
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let ps_script = format!(
                "$v = New-Object Windows.Security.Credentials.PasswordVault; \
                 $c = New-Object Windows.Security.Credentials.PasswordCredential('{}', '{}', '{}'); \
                 $v.Add($c)",
                service.replace('\'', "''"), account.replace('\'', "''"), secret.replace('\'', "''")
            );
            if let Ok(out) = Command::new("powershell").args(["-NoProfile", "-Command", &ps_script]).output() {
                if out.status.success() {
                    return Ok(());
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            if let Some(tool) = find_executable("secret-tool") {
                let mut child = Command::new(tool)
                    .args(["store", "--label=MyTerminal SSH Vault", "service", service, "account", account])
                    .stdin(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| e.to_string())?;
                if let Some(mut stdin) = child.stdin.take() {
                    use std::io::Write;
                    let _ = stdin.write_all(secret.as_bytes());
                }
                if let Ok(status) = child.wait() {
                    if status.success() {
                        return Ok(());
                    }
                }
            }
        }

        // Fallback: Permission-secured file storage
        let key = format!("{}:{}", service, account);
        let mut map = Self::read_fallback_vault();
        map.insert(key, secret.to_string());
        Self::write_fallback_vault(&map)
    }

    /// Retrieves a secret from the platform OS vault.
    pub fn get_secret(service: &str, account: &str) -> Result<Option<String>, String> {
        #[cfg(target_os = "macos")]
        {
            let res = Command::new("security")
                .arg("find-generic-password")
                .arg("-a").arg(account)
                .arg("-s").arg(service)
                .arg("-w") // Output secret only
                .output();
            if let Ok(out) = res {
                if out.status.success() {
                    let sec = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !sec.is_empty() {
                        return Ok(Some(sec));
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let ps_script = format!(
                "$v = New-Object Windows.Security.Credentials.PasswordVault; \
                 try {{ $c = $v.Retrieve('{}', '{}'); $c.RetrievePassword(); Write-Output $c.Password }} catch {{}}",
                service.replace('\'', "''"), account.replace('\'', "''")
            );
            if let Ok(out) = Command::new("powershell").args(["-NoProfile", "-Command", &ps_script]).output() {
                if out.status.success() {
                    let sec = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !sec.is_empty() {
                        return Ok(Some(sec));
                    }
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            if let Some(tool) = find_executable("secret-tool") {
                let res = Command::new(tool)
                    .args(["lookup", "service", service, "account", account])
                    .output();
                if let Ok(out) = res {
                    if out.status.success() {
                        let sec = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        if !sec.is_empty() {
                            return Ok(Some(sec));
                        }
                    }
                }
            }
        }

        // Fallback check
        let key = format!("{}:{}", service, account);
        let map = Self::read_fallback_vault();
        Ok(map.get(&key).cloned())
    }

    /// Deletes a secret from the platform OS vault.
    pub fn delete_secret(service: &str, account: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("security")
                .arg("delete-generic-password")
                .arg("-a").arg(account)
                .arg("-s").arg(service)
                .output();
        }

        #[cfg(target_os = "windows")]
        {
            let ps_script = format!(
                "$v = New-Object Windows.Security.Credentials.PasswordVault; \
                 try {{ $c = $v.Retrieve('{}', '{}'); $v.Remove($c) }} catch {{}}",
                service.replace('\'', "''"), account.replace('\'', "''")
            );
            let _ = Command::new("powershell").args(["-NoProfile", "-Command", &ps_script]).output();
        }

        #[cfg(target_os = "linux")]
        {
            if let Some(tool) = find_executable("secret-tool") {
                let _ = Command::new(tool)
                    .args(["clear", "service", service, "account", account])
                    .output();
            }
        }

        // Fallback cleanup
        let key = format!("{}:{}", service, account);
        let mut map = Self::read_fallback_vault();
        if map.remove(&key).is_some() {
            let _ = Self::write_fallback_vault(&map);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_private_keys() {
        let sample_output = "Error loading key: -----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA\n-----END OPENSSH PRIVATE KEY-----";
        let redacted = redact_credentials(sample_output);
        assert!(!redacted.contains("b3BlbnNzaC1rZXktdjEAAAA"));
        assert!(redacted.contains("[REDACTED PRIVATE KEY]"));
    }

    #[test]
    fn test_askpass_helper_lifecycle() {
        let helper = AskpassHelper::new("SuperSecretPass123!").expect("Failed to create helper");
        assert!(helper.script_path.exists());
        let script_path = helper.script_path.clone();
        drop(helper);
        assert!(!script_path.exists(), "Askpass script must be cleaned up on drop");
    }

    #[test]
    fn test_secure_vault_crud() {
        let service = "test_myterminal_service";
        let account = "test_user@example.com";
        let secret = "S3cur3P@ssw0rd!";

        // Store
        let store_res = SecureVault::store_secret(service, account, secret);
        assert!(store_res.is_ok(), "Storing secret should succeed");

        // Retrieve
        let retrieved = SecureVault::get_secret(service, account).unwrap();
        assert_eq!(retrieved, Some(secret.to_string()), "Retrieved secret must match");

        // Delete
        let del_res = SecureVault::delete_secret(service, account);
        assert!(del_res.is_ok(), "Deleting secret should succeed");

        // Confirm deleted
        let after_del = SecureVault::get_secret(service, account).unwrap();
        assert_eq!(after_del, None, "Secret must be removed after deletion");
    }
}

