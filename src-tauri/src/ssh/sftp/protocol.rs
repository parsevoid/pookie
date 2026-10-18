#![allow(dead_code)]

// Pure-Rust binary SFTP v3 (SSH File Transfer Protocol) wire codec
// Conforms to draft-ietf-secsh-filexfer-02.

use std::io::{self, Read, Write};

pub const SSH_FXP_INIT: u8 = 1;
pub const SSH_FXP_VERSION: u8 = 2;
pub const SSH_FXP_OPEN: u8 = 3;
pub const SSH_FXP_CLOSE: u8 = 4;
pub const SSH_FXP_READ: u8 = 5;
pub const SSH_FXP_WRITE: u8 = 6;
pub const SSH_FXP_LSTAT: u8 = 7;
pub const SSH_FXP_FSTAT: u8 = 8;
pub const SSH_FXP_OPENDIR: u8 = 11;
pub const SSH_FXP_READDIR: u8 = 12;
pub const SSH_FXP_REMOVE: u8 = 13;
pub const SSH_FXP_MKDIR: u8 = 14;
pub const SSH_FXP_RMDIR: u8 = 15;
pub const SSH_FXP_REALPATH: u8 = 16;
pub const SSH_FXP_STAT: u8 = 17;
pub const SSH_FXP_RENAME: u8 = 18;

pub const SSH_FXP_STATUS: u8 = 101;
pub const SSH_FXP_HANDLE: u8 = 102;
pub const SSH_FXP_DATA: u8 = 103;
pub const SSH_FXP_NAME: u8 = 104;
pub const SSH_FXP_ATTRS: u8 = 105;

pub const SSH_FX_OK: u32 = 0;
pub const SSH_FX_EOF: u32 = 1;
pub const SSH_FX_NO_SUCH_FILE: u32 = 2;
pub const SSH_FX_PERMISSION_DENIED: u32 = 3;
pub const SSH_FX_FAILURE: u32 = 4;
pub const SSH_FX_BAD_MESSAGE: u32 = 5;
pub const SSH_FX_NO_CONNECTION: u32 = 6;
pub const SSH_FX_CONNECTION_LOST: u32 = 7;
pub const SSH_FX_OP_UNSUPPORTED: u32 = 8;

pub const SSH_FXF_READ: u32 = 0x00000001;
pub const SSH_FXF_WRITE: u32 = 0x00000002;
pub const SSH_FXF_APPEND: u32 = 0x00000004;
pub const SSH_FXF_CREAT: u32 = 0x00000008;
pub const SSH_FXF_TRUNC: u32 = 0x00000010;
pub const SSH_FXF_EXCL: u32 = 0x00000020;

pub const SSH_FILEXFER_ATTR_SIZE: u32 = 0x00000001;
pub const SSH_FILEXFER_ATTR_UIDGID: u32 = 0x00000002;
pub const SSH_FILEXFER_ATTR_PERMISSIONS: u32 = 0x00000004;
pub const SSH_FILEXFER_ATTR_ACMODTIME: u32 = 0x00000008;

#[derive(Debug, Clone, Default)]
pub struct SftpFileAttr {
    pub size: Option<u64>,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    pub permissions: Option<u32>,
    pub atime: Option<u32>,
    pub mtime: Option<u32>,
}

impl SftpFileAttr {
    pub fn is_dir(&self) -> bool {
        self.permissions.map(|p| (p & 0o170000) == 0o040000).unwrap_or(false)
    }

    pub fn is_symlink(&self) -> bool {
        self.permissions.map(|p| (p & 0o170000) == 0o120000).unwrap_or(false)
    }

    pub fn format_permissions(&self) -> String {
        let p = match self.permissions {
            Some(perms) => perms,
            None => return "-rw-r--r--".to_string(),
        };

        let ftype = if (p & 0o170000) == 0o040000 {
            'd'
        } else if (p & 0o170000) == 0o120000 {
            'l'
        } else {
            '-'
        };

        let rwx = |shift: u32| {
            let m = (p >> shift) & 0o7;
            [
                if m & 4 != 0 { 'r' } else { '-' },
                if m & 2 != 0 { 'w' } else { '-' },
                if m & 1 != 0 { 'x' } else { '-' },
            ]
        };

        let u = rwx(6);
        let g = rwx(3);
        let o = rwx(0);

        format!("{}{}{}{}", ftype, u.iter().collect::<String>(), g.iter().collect::<String>(), o.iter().collect::<String>())
    }
}

#[derive(Debug, Clone)]
pub struct SftpNameEntry {
    pub filename: String,
    pub longname: String,
    pub attrs: SftpFileAttr,
}

pub struct PacketWriter {
    buffer: Vec<u8>,
}

impl PacketWriter {
    pub fn new(packet_type: u8, request_id: u32) -> Self {
        let mut pw = Self { buffer: Vec::new() };
        pw.put_u8(packet_type);
        pw.put_u32(request_id);
        pw
    }

    pub fn new_init(version: u32) -> Self {
        let mut pw = Self { buffer: Vec::new() };
        pw.put_u8(SSH_FXP_INIT);
        pw.put_u32(version);
        pw
    }

    pub fn put_u8(&mut self, val: u8) {
        self.buffer.push(val);
    }

    pub fn put_u32(&mut self, val: u32) {
        self.buffer.extend_from_slice(&val.to_be_bytes());
    }

    pub fn put_u64(&mut self, val: u64) {
        self.buffer.extend_from_slice(&val.to_be_bytes());
    }

    pub fn put_string(&mut self, val: &str) {
        self.put_bytes(val.as_bytes());
    }

    pub fn put_bytes(&mut self, bytes: &[u8]) {
        self.put_u32(bytes.len() as u32);
        self.buffer.extend_from_slice(bytes);
    }

    pub fn write_to<W: Write>(&self, writer: &mut W) -> io::Result<()> {
        let len = self.buffer.len() as u32;
        writer.write_all(&len.to_be_bytes())?;
        writer.write_all(&self.buffer)?;
        writer.flush()?;
        Ok(())
    }
}

pub struct PacketReader<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> PacketReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    pub fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.offset)
    }

    pub fn get_u8(&mut self) -> io::Result<u8> {
        if self.offset + 1 > self.data.len() {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "SFTP packet truncated"));
        }
        let b = self.data[self.offset];
        self.offset += 1;
        Ok(b)
    }

    pub fn get_u32(&mut self) -> io::Result<u32> {
        if self.offset + 4 > self.data.len() {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "SFTP packet truncated"));
        }
        let bytes: [u8; 4] = self.data[self.offset..self.offset + 4].try_into().unwrap();
        self.offset += 4;
        Ok(u32::from_be_bytes(bytes))
    }

    pub fn get_u64(&mut self) -> io::Result<u64> {
        if self.offset + 8 > self.data.len() {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "SFTP packet truncated"));
        }
        let bytes: [u8; 8] = self.data[self.offset..self.offset + 8].try_into().unwrap();
        self.offset += 8;
        Ok(u64::from_be_bytes(bytes))
    }

    pub fn get_bytes(&mut self) -> io::Result<&'a [u8]> {
        let len = self.get_u32()? as usize;
        if self.offset + len > self.data.len() {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "SFTP string truncated"));
        }
        let slice = &self.data[self.offset..self.offset + len];
        self.offset += len;
        Ok(slice)
    }

    pub fn get_string(&mut self) -> io::Result<String> {
        let bytes = self.get_bytes()?;
        Ok(String::from_utf8_lossy(bytes).to_string())
    }

    pub fn get_attrs(&mut self) -> io::Result<SftpFileAttr> {
        let flags = self.get_u32()?;
        let mut attr = SftpFileAttr::default();

        if (flags & SSH_FILEXFER_ATTR_SIZE) != 0 {
            attr.size = Some(self.get_u64()?);
        }
        if (flags & SSH_FILEXFER_ATTR_UIDGID) != 0 {
            attr.uid = Some(self.get_u32()?);
            attr.gid = Some(self.get_u32()?);
        }
        if (flags & SSH_FILEXFER_ATTR_PERMISSIONS) != 0 {
            attr.permissions = Some(self.get_u32()?);
        }
        if (flags & SSH_FILEXFER_ATTR_ACMODTIME) != 0 {
            attr.atime = Some(self.get_u32()?);
            attr.mtime = Some(self.get_u32()?);
        }

        Ok(attr)
    }
}

/// Reads a complete SFTP packet frame from reader (4-byte length + payload).
pub fn read_packet<R: Read>(reader: &mut R) -> io::Result<(u8, Vec<u8>)> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let length = u32::from_be_bytes(len_buf) as usize;

    if length == 0 || length > 4 * 1024 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("Invalid SFTP packet size: {}", length)));
    }

    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload)?;

    let packet_type = payload[0];
    Ok((packet_type, payload[1..].to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_packet_writer_and_reader_roundtrip() {
        let mut pw = PacketWriter::new(SSH_FXP_OPEN, 42);
        pw.put_string("/home/user/my test file with spaces & 'quotes'.txt");
        pw.put_u32(SSH_FXF_READ | SSH_FXF_WRITE);
        pw.put_u64(1048576);

        let mut cursor = io::Cursor::new(Vec::new());
        pw.write_to(&mut cursor).expect("Failed to write packet");

        cursor.set_position(0);
        let (ptype, payload) = read_packet(&mut cursor).expect("Failed to read packet");
        assert_eq!(ptype, SSH_FXP_OPEN);

        let mut pr = PacketReader::new(&payload);
        assert_eq!(pr.get_u32().unwrap(), 42);
        assert_eq!(
            pr.get_string().unwrap(),
            "/home/user/my test file with spaces & 'quotes'.txt"
        );
        assert_eq!(pr.get_u32().unwrap(), SSH_FXF_READ | SSH_FXF_WRITE);
        assert_eq!(pr.get_u64().unwrap(), 1048576);
    }

    #[test]
    fn test_sftp_file_attributes_formatting() {
        let dir_attr = SftpFileAttr {
            permissions: Some(0o040755), // directory rwxr-xr-x
            size: Some(4096),
            ..Default::default()
        };
        assert!(dir_attr.is_dir());
        assert!(!dir_attr.is_symlink());
        assert_eq!(dir_attr.format_permissions(), "drwxr-xr-x");

        let symlink_attr = SftpFileAttr {
            permissions: Some(0o120777), // symlink rwxrwxrwx
            size: Some(12),
            ..Default::default()
        };
        assert!(!symlink_attr.is_dir());
        assert!(symlink_attr.is_symlink());
        assert_eq!(symlink_attr.format_permissions(), "lrwxrwxrwx");

        let file_attr = SftpFileAttr {
            permissions: Some(0o100644), // regular file rw-r--r--
            size: Some(1024),
            ..Default::default()
        };
        assert!(!file_attr.is_dir());
        assert!(!file_attr.is_symlink());
        assert_eq!(file_attr.format_permissions(), "-rw-r--r--");
    }

    #[test]
    fn test_unicode_and_special_character_paths() {
        let test_paths = vec![
            "/var/log/🚀_rocket_report.log",
            "/home/user/файл_с_пробелами.txt",
            "/opt/app/path with \"quotes\" and 'single' and ;rm -rf /.txt",
        ];

        for path in test_paths {
            let mut pw = PacketWriter::new(SSH_FXP_LSTAT, 100);
            pw.put_string(path);

            let mut cursor = io::Cursor::new(Vec::new());
            pw.write_to(&mut cursor).unwrap();

            cursor.set_position(0);
            let (ptype, payload) = read_packet(&mut cursor).unwrap();
            assert_eq!(ptype, SSH_FXP_LSTAT);

            let mut pr = PacketReader::new(&payload);
            assert_eq!(pr.get_u32().unwrap(), 100);
            assert_eq!(pr.get_string().unwrap(), path);
        }
    }
}

