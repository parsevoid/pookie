use std::path::{Path, PathBuf};
use std::process::Command;

/// Expands a path string like "~/.ssh/id_rsa" to an absolute PathBuf without shell expansion.
pub fn expand_tilde(p: &str) -> PathBuf {
    if let Some(stripped) = p.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    } else if p == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(p)
}

/// Locates a required executable on the host system across macOS, Linux, and Windows.
pub fn find_executable(name: &str) -> Option<PathBuf> {
    // 1. Check directly via standard PATH lookup
    if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(name)
        .output()
    {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = out_str.lines().next() {
                let candidate = PathBuf::from(first_line.trim());
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    // 2. Fall back to standard known platform directories
    let common_dirs: Vec<PathBuf> = if cfg!(windows) {
        vec![
            PathBuf::from(r"C:\Windows\System32\OpenSSH"),
            PathBuf::from(r"C:\Program Files\OpenSSH"),
            PathBuf::from(r"C:\Program Files\Git\usr\bin"),
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            PathBuf::from("/usr/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/opt/homebrew/bin"),
        ]
    } else {
        vec![
            PathBuf::from("/usr/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/bin"),
        ]
    };

    let bin_name = if cfg!(windows) && !name.ends_with(".exe") {
        format!("{}.exe", name)
    } else {
        name.to_string()
    };

    for dir in common_dirs {
        let candidate = dir.join(&bin_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

/// Sets restrictive directory permissions (0700) on Unix; no-op on Windows.
pub fn secure_directory(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o700);
        std::fs::set_permissions(path, perms)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// Sets restrictive file permissions (0600) on Unix; no-op on Windows.
pub fn secure_file(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, perms)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// Opens a file in the system default application or reveals it in file manager.
pub fn open_or_reveal_file(path: &Path, reveal: bool) -> Result<(), String> {
    let path_str = path.to_string_lossy();

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        if reveal {
            cmd.arg("-R");
        }
        cmd.arg(&*path_str);
        cmd.spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        if reveal {
            Command::new("explorer")
                .args(["/select,", &*path_str])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("cmd")
                .args(["/c", "start", "", &*path_str])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let target = if reveal {
            path.parent().unwrap_or(path).to_string_lossy()
        } else {
            path_str
        };
        Command::new("xdg-open")
            .arg(&*target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
