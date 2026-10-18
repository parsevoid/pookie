export interface RemoteFile {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  permissions: string;
  modificationDate: string;
  owner: string;
}

export function getFormattedSize(file: RemoteFile): string {
  if (file.isDirectory) return '--';
  const bytes = file.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const CODE_EXTENSIONS = new Set([
  'swift', 'js', 'ts', 'py', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'php', 'rb', 'sh', 'zsh', 'bash',
]);
const CONFIG_EXTENSIONS = new Set([
  'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'conf', 'config', 'env',
]);
const DOC_EXTENSIONS = new Set(['md', 'txt', 'rtf', 'log']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar']);
const KEY_EXTENSIONS = new Set(['pem', 'pub', 'key', 'crt', 'cer']);

export type FileIconType = 'folder' | 'code' | 'config' | 'document' | 'image' | 'archive' | 'key' | 'file';

export function getFileIconType(file: RemoteFile): FileIconType {
  if (file.isDirectory) return 'folder';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (CONFIG_EXTENSIONS.has(ext)) return 'config';
  if (DOC_EXTENSIONS.has(ext)) return 'document';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (KEY_EXTENSIONS.has(ext)) return 'key';
  return 'file';
}
