use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SshErrorKind {
    DnsResolutionFailed,
    NetworkUnreachable,
    ConnectionTimeout,
    BackendUnavailable,
    HostKeyUnknown,
    HostKeyChanged,
    AuthFailed,
    PermissionDenied,
    FileNotFound,
    ConflictRemoteModified,
    SftpProtocolError,
    Io,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshError {
    pub kind: SshErrorKind,
    pub message: String,
    pub details: Option<String>,
}

impl SshError {
    pub fn new(kind: SshErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            details: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_details(kind: SshErrorKind, message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            details: Some(details.into()),
        }
    }

    pub fn user_friendly_message(&self) -> String {
        match self.kind {
            SshErrorKind::HostKeyChanged => format!(
                "SECURITY WARNING: Remote host key has changed! Potential man-in-the-middle attack or server re-provisioning. Connection aborted.\n{}",
                self.message
            ),
            SshErrorKind::HostKeyUnknown => format!(
                "Host key not verified. Please approve the host fingerprint before connecting.\n{}",
                self.message
            ),
            SshErrorKind::AuthFailed => format!("Authentication failed: {}", self.message),
            SshErrorKind::ConflictRemoteModified => format!(
                "Edit Conflict: The file was modified on the remote server after you opened it. Local changes were not overwritten.\n{}",
                self.message
            ),
            SshErrorKind::NetworkUnreachable => format!("Server unreachable: {}", self.message),
            SshErrorKind::ConnectionTimeout => format!("Connection timed out: {}", self.message),
            _ => self.message.clone(),
        }
    }
}

impl fmt::Display for SshError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.user_friendly_message())
    }
}

impl std::error::Error for SshError {}

impl From<std::io::Error> for SshError {
    fn from(err: std::io::Error) -> Self {
        Self::new(SshErrorKind::Io, err.to_string())
    }
}

impl From<String> for SshError {
    fn from(msg: String) -> Self {
        Self::new(SshErrorKind::Other, msg)
    }
}

impl From<&str> for SshError {
    fn from(msg: &str) -> Self {
        Self::new(SshErrorKind::Other, msg)
    }
}
