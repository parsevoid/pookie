import type { SSHHost } from './SSHHost';

export interface RemoteFileItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  permissions: string;
  owner: string;
  group: string;
  modified: string;
}

export interface SFTPWindow {
  id: string;
  host: SSHHost;
  currentPath: string;
  history: string[];
  historyIdx: number;
  files: RemoteFileItem[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  createdAt: number;
}

export function createSFTPWindow(host: SSHHost, initialPath: string = '/'): SFTPWindow {
  return {
    id: `sftp-win-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    host,
    currentPath: initialPath,
    history: [initialPath],
    historyIdx: 0,
    files: [],
    searchQuery: '',
    isLoading: false,
    error: null,
    createdAt: Date.now(),
  };
}
