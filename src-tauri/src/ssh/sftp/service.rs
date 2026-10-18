use crate::ssh::error::{SshError, SshErrorKind};
use crate::ssh::sftp::protocol::*;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::process::Child;
use std::sync::atomic::{AtomicU32, Ordering};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub permissions: String,
    pub owner: String,
    pub group: String,
    pub modified: String,
}

pub struct SftpClient {
    child: Option<Child>,
    stdin: Box<dyn Write + Send>,
    stdout: Box<dyn Read + Send>,
    req_id: AtomicU32,
}

impl SftpClient {
    pub fn new(child: Child, stdin: Box<dyn Write + Send>, stdout: Box<dyn Read + Send>) -> Self {
        Self {
            child: Some(child),
            stdin,
            stdout,
            req_id: AtomicU32::new(1),
        }
    }

    pub fn next_req_id(&self) -> u32 {
        self.req_id.fetch_add(1, Ordering::SeqCst)
    }

    /// Performs the initial SFTP version negotiation handshake.
    pub fn init_handshake(&mut self) -> Result<u32, SshError> {
        let pw = PacketWriter::new_init(3);
        pw.write_to(&mut self.stdin)
            .map_err(|e| SshError::new(SshErrorKind::SftpProtocolError, format!("Failed to send SFTP INIT: {}", e)))?;

        let (ptype, payload) = read_packet(&mut self.stdout)
            .map_err(|e| SshError::new(SshErrorKind::SftpProtocolError, format!("Failed to read SFTP VERSION: {}", e)))?;

        if ptype != SSH_FXP_VERSION {
            return Err(SshError::new(
                SshErrorKind::SftpProtocolError,
                format!("Expected SFTP VERSION ({}), received packet {}", SSH_FXP_VERSION, ptype),
            ));
        }

        let mut pr = PacketReader::new(&payload);
        let version = pr.get_u32().unwrap_or(3);
        Ok(version)
    }

    /// Sends a request and awaits response, verifying request ID matching.
    fn roundtrip(&mut self, pw: PacketWriter, expected_req_id: u32) -> Result<(u8, Vec<u8>), SshError> {
        pw.write_to(&mut self.stdin)
            .map_err(|e| SshError::new(SshErrorKind::Io, e.to_string()))?;

        let (resp_type, payload) = read_packet(&mut self.stdout)
            .map_err(|e| SshError::new(SshErrorKind::SftpProtocolError, format!("SFTP read error: {}", e)))?;

        if payload.len() >= 4 {
            let resp_id = u32::from_be_bytes(payload[0..4].try_into().unwrap());
            if resp_id != expected_req_id {
                return Err(SshError::new(
                    SshErrorKind::SftpProtocolError,
                    format!("SFTP request/response ID mismatch (sent {}, received {})", expected_req_id, resp_id),
                ));
            }
        }

        Ok((resp_type, payload))
    }

    /// Helper to verify an SSH_FXP_STATUS response is SSH_FX_OK.
    fn check_status(resp_type: u8, payload: &[u8]) -> Result<(), SshError> {
        if resp_type == SSH_FXP_STATUS {
            let mut pr = PacketReader::new(payload);
            let _req_id = pr.get_u32()?;
            let code = pr.get_u32()?;
            let msg = pr.get_string().unwrap_or_default();
            if code == SSH_FX_OK {
                return Ok(());
            } else if code == SSH_FX_NO_SUCH_FILE {
                return Err(SshError::new(SshErrorKind::FileNotFound, "No such file or directory"));
            } else if code == SSH_FX_PERMISSION_DENIED {
                return Err(SshError::new(SshErrorKind::PermissionDenied, "Permission denied"));
            } else {
                return Err(SshError::new(
                    SshErrorKind::SftpProtocolError,
                    format!("SFTP error (code {}): {}", code, msg),
                ));
            }
        }
        Ok(())
    }

    /// Lists a remote directory using real SFTP OPENDIR and READDIR commands.
    pub fn list_dir(&mut self, remote_dir: &str) -> Result<Vec<RemoteFileItem>, SshError> {
        let req_id = self.next_req_id();
        let mut pw = PacketWriter::new(SSH_FXP_OPENDIR, req_id);
        pw.put_string(remote_dir);

        let (resp_type, payload) = self.roundtrip(pw, req_id)?;
        if resp_type != SSH_FXP_HANDLE {
            Self::check_status(resp_type, &payload)?;
            return Err(SshError::new(SshErrorKind::SftpProtocolError, "Expected SFTP handle for OPENDIR"));
        }

        let mut pr = PacketReader::new(&payload);
        let _ = pr.get_u32()?;
        let handle = pr.get_bytes()?.to_vec();

        let mut items = Vec::new();
        let clean_base = remote_dir.trim_end_matches('/');

        loop {
            let rdir_req = self.next_req_id();
            let mut rdir_pw = PacketWriter::new(SSH_FXP_READDIR, rdir_req);
            rdir_pw.put_bytes(&handle);

            let (rdir_type, rdir_payload) = self.roundtrip(rdir_pw, rdir_req)?;
            if rdir_type == SSH_FXP_STATUS {
                let mut status_pr = PacketReader::new(&rdir_payload);
                let _ = status_pr.get_u32()?;
                let code = status_pr.get_u32()?;
                if code == SSH_FX_EOF {
                    break; // Reached end of directory entries
                }
                Self::check_status(rdir_type, &rdir_payload)?;
                break;
            } else if rdir_type == SSH_FXP_NAME {
                let mut name_pr = PacketReader::new(&rdir_payload);
                let _ = name_pr.get_u32()?;
                let count = name_pr.get_u32()?;

                for _ in 0..count {
                    let filename = name_pr.get_string()?;
                    let longname = name_pr.get_string()?;
                    let attrs = name_pr.get_attrs()?;

                    if filename == "." || filename == ".." {
                        continue;
                    }

                    let full_path = if clean_base.is_empty() {
                        format!("/{}", filename)
                    } else {
                        format!("{}/{}", clean_base, filename)
                    };

                    let is_dir = attrs.is_dir();
                    let is_symlink = attrs.is_symlink();
                    let size = attrs.size.unwrap_or(0);
                    let permissions = attrs.format_permissions();

                    let modified = attrs
                        .mtime
                        .map(|t| {
                            let dt = chrono_format_time(t);
                            dt
                        })
                        .unwrap_or_else(|| "".to_string());

                    // Parse owner and group from longname if present
                    let parts: Vec<&str> = longname.split_whitespace().collect();
                    let owner = if parts.len() > 3 { parts[2].to_string() } else { "user".to_string() };
                    let group = if parts.len() > 3 { parts[3].to_string() } else { "group".to_string() };

                    items.push(RemoteFileItem {
                        name: filename,
                        path: full_path,
                        is_dir,
                        is_symlink,
                        size,
                        permissions,
                        owner,
                        group,
                        modified,
                    });
                }
            } else {
                break;
            }
        }

        // Close dir handle
        let close_req = self.next_req_id();
        let mut close_pw = PacketWriter::new(SSH_FXP_CLOSE, close_req);
        close_pw.put_bytes(&handle);
        let (close_type, close_payload) = self.roundtrip(close_pw, close_req)?;
        Self::check_status(close_type, &close_payload)?;

        items.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));
        Ok(items)
    }

    /// Reads up to max_bytes from a remote file.
    pub fn read_file(&mut self, remote_path: &str, max_bytes: usize) -> Result<Vec<u8>, SshError> {
        let req_id = self.next_req_id();
        let mut pw = PacketWriter::new(SSH_FXP_OPEN, req_id);
        pw.put_string(remote_path);
        pw.put_u32(SSH_FXF_READ);
        pw.put_u32(0); // empty attrs

        let (resp_type, payload) = self.roundtrip(pw, req_id)?;
        if resp_type != SSH_FXP_HANDLE {
            Self::check_status(resp_type, &payload)?;
            return Err(SshError::new(SshErrorKind::SftpProtocolError, "Failed to open remote file for reading"));
        }

        let mut pr = PacketReader::new(&payload);
        let _ = pr.get_u32()?;
        let handle = pr.get_bytes()?.to_vec();

        let mut content = Vec::new();
        let mut offset = 0u64;
        let chunk_size = 32768u32; // 32KB SFTP read chunk

        loop {
            if content.len() >= max_bytes {
                break;
            }

            let read_req = self.next_req_id();
            let mut read_pw = PacketWriter::new(SSH_FXP_READ, read_req);
            read_pw.put_bytes(&handle);
            read_pw.put_u64(offset);
            let to_read = (max_bytes - content.len()).min(chunk_size as usize) as u32;
            read_pw.put_u32(to_read);

            let (read_type, read_payload) = self.roundtrip(read_pw, read_req)?;
            if read_type == SSH_FXP_STATUS {
                break; // EOF
            } else if read_type == SSH_FXP_DATA {
                let mut data_pr = PacketReader::new(&read_payload);
                let _ = data_pr.get_u32()?;
                let bytes = data_pr.get_bytes()?;
                if bytes.is_empty() {
                    break;
                }
                content.extend_from_slice(bytes);
                offset += bytes.len() as u64;
            } else {
                break;
            }
        }

        let close_req = self.next_req_id();
        let mut close_pw = PacketWriter::new(SSH_FXP_CLOSE, close_req);
        close_pw.put_bytes(&handle);
        let _ = self.roundtrip(close_pw, close_req);

        Ok(content)
    }

    /// Queries LSTAT attributes for a remote path (useful for modification time conflict detection).
    pub fn stat_file(&mut self, remote_path: &str) -> Result<SftpFileAttr, SshError> {
        let req_id = self.next_req_id();
        let mut pw = PacketWriter::new(SSH_FXP_LSTAT, req_id);
        pw.put_string(remote_path);

        let (resp_type, payload) = self.roundtrip(pw, req_id)?;
        if resp_type == SSH_FXP_ATTRS {
            let mut pr = PacketReader::new(&payload);
            let _ = pr.get_u32()?;
            let attr = pr.get_attrs().map_err(|e| SshError::new(SshErrorKind::SftpProtocolError, e.to_string()))?;
            Ok(attr)
        } else {
            Self::check_status(resp_type, &payload)?;
            Err(SshError::new(SshErrorKind::FileNotFound, format!("File '{}' not found", remote_path)))
        }
    }

    /// Writes data to a remote file. If atomic is true, writes to a temporary remote file
    /// in the same directory and renames it over the target.
    pub fn write_file(&mut self, remote_path: &str, data: &[u8], atomic: bool) -> Result<(), SshError> {
        let target_path = if atomic {
            let unique_id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let parent = remote_path.rsplit_once('/').map(|(p, _)| p).unwrap_or("");
            let filename = remote_path.rsplit_once('/').map(|(_, f)| f).unwrap_or(remote_path);
            if parent.is_empty() {
                format!(".{}.tmp.{}", filename, unique_id)
            } else {
                format!("{}/.{}.tmp.{}", parent, filename, unique_id)
            }
        } else {
            remote_path.to_string()
        };

        // Open for writing (CREATE | TRUNCATE)
        let open_req = self.next_req_id();
        let mut pw = PacketWriter::new(SSH_FXP_OPEN, open_req);
        pw.put_string(&target_path);
        pw.put_u32(SSH_FXF_WRITE | SSH_FXF_CREAT | SSH_FXF_TRUNC);
        pw.put_u32(0); // default permissions

        let (resp_type, payload) = self.roundtrip(pw, open_req)?;
        if resp_type != SSH_FXP_HANDLE {
            Self::check_status(resp_type, &payload)?;
            return Err(SshError::new(SshErrorKind::SftpProtocolError, "Failed to open remote file for writing"));
        }

        let mut pr = PacketReader::new(&payload);
        let _ = pr.get_u32()?;
        let handle = pr.get_bytes()?.to_vec();

        // Stream data in 32KB chunks
        let chunk_size = 32768usize;
        let mut offset = 0u64;

        for chunk in data.chunks(chunk_size) {
            let write_req = self.next_req_id();
            let mut write_pw = PacketWriter::new(SSH_FXP_WRITE, write_req);
            write_pw.put_bytes(&handle);
            write_pw.put_u64(offset);
            write_pw.put_bytes(chunk);

            let (w_type, w_payload) = self.roundtrip(write_pw, write_req)?;
            Self::check_status(w_type, &w_payload)?;
            offset += chunk.len() as u64;
        }

        // Close write handle
        let close_req = self.next_req_id();
        let mut close_pw = PacketWriter::new(SSH_FXP_CLOSE, close_req);
        close_pw.put_bytes(&handle);
        let (close_type, close_payload) = self.roundtrip(close_pw, close_req)?;
        Self::check_status(close_type, &close_payload)?;

        // If atomic, atomically rename the temp file to the target path
        if atomic {
            self.rename_file(&target_path, remote_path)?;
        }

        Ok(())
    }

    /// Creates a directory on the remote server via SSH_FXP_MKDIR.
    pub fn create_dir(&mut self, remote_dir: &str) -> Result<(), SshError> {
        let req_id = self.next_req_id();
        let mut pw = PacketWriter::new(SSH_FXP_MKDIR, req_id);
        pw.put_string(remote_dir);
        pw.put_u32(0); // default attrs

        let (resp_type, payload) = self.roundtrip(pw, req_id)?;
        Self::check_status(resp_type, &payload)?;
        Ok(())
    }

    /// Removes a file via SSH_FXP_REMOVE or a directory via SSH_FXP_RMDIR.
    pub fn delete_file(&mut self, remote_path: &str) -> Result<(), SshError> {
        // Check if directory
        let is_dir = self.stat_file(remote_path).map(|a| a.is_dir()).unwrap_or(false);

        let req_id = self.next_req_id();
        let packet_type = if is_dir { SSH_FXP_RMDIR } else { SSH_FXP_REMOVE };
        let mut pw = PacketWriter::new(packet_type, req_id);
        pw.put_string(remote_path);

        let (resp_type, payload) = self.roundtrip(pw, req_id)?;
        Self::check_status(resp_type, &payload)?;
        Ok(())
    }

    /// Renames a remote file via SSH_FXP_RENAME.
    pub fn rename_file(&mut self, old_path: &str, new_path: &str) -> Result<(), SshError> {
        let req_id = self.next_req_id();
        let mut pw = PacketWriter::new(SSH_FXP_RENAME, req_id);
        pw.put_string(old_path);
        pw.put_string(new_path);

        let (resp_type, payload) = self.roundtrip(pw, req_id)?;
        Self::check_status(resp_type, &payload)?;
        Ok(())
    }
}

impl Drop for SftpClient {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
        }
    }
}

/// Simple helper to format unix seconds into readable YYYY-MM-DD HH:MM:SS.
fn chrono_format_time(secs: u32) -> String {
    let s = secs as u64;
    let days = s / 86400;
    let rem_secs = s % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let secs = rem_secs % 60;

    // Approximate year/month from days since 1970
    let mut year = 1970;
    let mut d = days;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        year += 1;
    }

    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let month_days = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 1;
    for &md in &month_days {
        if d < md {
            break;
        }
        d -= md;
        month += 1;
    }
    let day = d + 1;

    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", year, month, day, hours, mins, secs)
}
