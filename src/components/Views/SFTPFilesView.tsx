import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder,
  FolderTree,
  File,
  FileCode2,
  FileText,
  FileImage,
  Archive,
  Terminal,
  RefreshCw,
  ArrowUp,
  Home,
  Plus,
  Trash2,
  Edit2,
  Eye,
  Check,
  X,
  Server,
  Search,
  ChevronRight,
  Loader2,
  AlertCircle,
  Save,
  Columns3,
  Maximize2,
  ArrowLeft,
  ArrowRight,
  Copy,
  CheckCheck,
  PanelRightClose,
  Scissors,
  ClipboardPaste,
  UploadCloud,
  Upload,
  ExternalLink,
  Code,
  Download,
  GripVertical,
} from 'lucide-react';
import type { AppStateContext } from '../../stores/appState';
import type { SSHHost } from '../../models/SSHHost';
import type { RemoteFileItem, SFTPWindow } from '../../models/SFTPWindow';
import { ColorPalette } from '../../styles/theme';

export type { RemoteFileItem };

export interface SFTPClipboardItem {
  item: RemoteFileItem;
  sourceHost: SSHHost;
  operation: 'copy' | 'cut';
}

export interface AvailableEditor {
  id: string;
  name: string;
  is_available: boolean;
}

interface SFTPFilesViewProps {
  appState: AppStateContext;
  initialHost?: SSHHost | null;
  isSidePanel?: boolean;
  onCloseSidePanel?: () => void;
  onExpandToFullView?: () => void;
  onDockToSidePanel?: () => void;
}

export const SFTPFilesView: React.FC<SFTPFilesViewProps> = ({
  appState,
  initialHost,
  isSidePanel = false,
  onCloseSidePanel,
  onExpandToFullView,
  onDockToSidePanel,
}) => {
  const {
    sshHosts,
    connectToSSHHost,
    selectedSftpHost,
    sftpWindows,
    activeSftpWindowId,
    setActiveSftpWindowId,
    openSftpWindow,
    closeSftpWindow,
    updateSftpWindow,
    setShowSftpSidePanel,
    setSelectedTool,
  } = appState;

  const palette = appState.settings?.customPalette;
  const primaryColor = palette?.primary || '#38bdf8';

  // Active window resolution
  const activeWindow: SFTPWindow | null =
    sftpWindows.find((w) => w.id === activeSftpWindowId) ||
    (sftpWindows.length > 0 && activeSftpWindowId === null ? null : sftpWindows[0] || null);

  const activeHost = activeWindow?.host || null;
  const currentPath = activeWindow?.currentPath || '/';
  const history = activeWindow?.history || ['/'];
  const historyIdx = activeWindow?.historyIdx || 0;
  const files = activeWindow?.files || [];
  const isLoading = activeWindow?.isLoading || false;
  const error = activeWindow?.error || null;
  const searchQuery = activeWindow?.searchQuery || '';

  // Modals & Editor states
  const [viewingFile, setViewingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [isEditorSaving, setIsEditorSaving] = useState<boolean>(false);
  const [editorSaveSuccess, setEditorSaveSuccess] = useState<boolean>(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [showNewFileModal, setShowNewFileModal] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [renamingItem, setRenamingItem] = useState<RemoteFileItem | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [deletingItem, setDeletingItem] = useState<RemoteFileItem | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // SFTP Clipboard state (copy/cut/paste across servers and directories)
  const [clipboardItem, setClipboardItem] = useState<SFTPClipboardItem | null>(null);

  // Drag and drop & Desktop upload states
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);

  // Internal drag-and-drop state (server file rows)
  const [draggedItem, setDraggedItem] = useState<RemoteFileItem | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Toast notification
  const [statusToast, setStatusToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setStatusToast({ message, type });
    setTimeout(() => {
      setStatusToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  // OS opening & editor state
  const [openingEditorPath, setOpeningEditorPath] = useState<string | null>(null);

  // Sync initialHost or selectedSftpHost if provided
  useEffect(() => {
    const targetHost = initialHost || selectedSftpHost;
    if (targetHost) {
      openSftpWindow(targetHost, '/');
    }
  }, [initialHost, selectedSftpHost, openSftpWindow]);

  // Load directory items
  const loadDirectory = useCallback(
    async (path: string, windowId?: string) => {
      const targetWinId = windowId || activeWindow?.id;
      if (!targetWinId) return;

      const win = sftpWindows.find((w) => w.id === targetWinId);
      if (!win || !win.host) return;

      updateSftpWindow(targetWinId, { isLoading: true, error: null });

      const config = {
        hostname: win.host.hostname,
        port: win.host.port || 22,
        username: win.host.username || 'root',
        auth_type: win.host.authMethod,
        key_path: win.host.keyPath || null,
        password: win.host.password || null,
      };

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const items = await invoke<RemoteFileItem[]>('sftp_list_files', {
          config,
          remotePath: path,
        });
        updateSftpWindow(targetWinId, {
          files: items,
          currentPath: path,
          isLoading: false,
          error: null,
        });
      } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
        updateSftpWindow(targetWinId, {
          files: [],
          isLoading: false,
          error: msg,
        });
      }
    },
    [activeWindow?.id, sftpWindows, updateSftpWindow]
  );

  // Load directory on initial mount or when window path is empty
  const loadedWindowsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeWindow && activeWindow.files.length === 0 && !activeWindow.isLoading && !loadedWindowsRef.current.has(activeWindow.id)) {
      loadedWindowsRef.current.add(activeWindow.id);
      loadDirectory(activeWindow.currentPath, activeWindow.id);
    }
  }, [activeWindow, loadDirectory]);

  // Navigation handlers
  const navigateTo = (newPath: string) => {
    if (!activeWindow) return;
    const clean = newPath.replace(/\/+/g, '/') || '/';
    const newHist = history.slice(0, historyIdx + 1);
    newHist.push(clean);

    updateSftpWindow(activeWindow.id, {
      currentPath: clean,
      history: newHist,
      historyIdx: newHist.length - 1,
    });
    loadDirectory(clean, activeWindow.id);
  };

  const navigateBack = () => {
    if (!activeWindow || historyIdx <= 0) return;
    const prevIdx = historyIdx - 1;
    const prevPath = history[prevIdx];
    updateSftpWindow(activeWindow.id, {
      currentPath: prevPath,
      historyIdx: prevIdx,
    });
    loadDirectory(prevPath, activeWindow.id);
  };

  const navigateForward = () => {
    if (!activeWindow || historyIdx >= history.length - 1) return;
    const nextIdx = historyIdx + 1;
    const nextPath = history[nextIdx];
    updateSftpWindow(activeWindow.id, {
      currentPath: nextPath,
      historyIdx: nextIdx,
    });
    loadDirectory(nextPath, activeWindow.id);
  };

  const navigateUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    navigateTo(upPath || '/');
  };

  // Open file in viewer / editor
  const handleOpenFile = async (file: RemoteFileItem) => {
    if (!activeHost) return;
    updateSftpWindow(activeWindow!.id, { isLoading: true });
    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<string>('sftp_read_file', {
        config,
        filePath: file.path,
      });
      setViewingFile({ path: file.path, name: file.name, content });
      updateSftpWindow(activeWindow!.id, { error: null });
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      updateSftpWindow(activeWindow!.id, { error: `Failed to read ${file.name}: ${msg}` });
    } finally {
      updateSftpWindow(activeWindow!.id, { isLoading: false });
    }
  };

  // Save edited file back to remote
  const handleSaveFile = async () => {
    if (!viewingFile || !activeHost || !activeWindow) return;
    setIsEditorSaving(true);
    setEditorSaveSuccess(false);

    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sftp_write_file', {
        config,
        filePath: viewingFile.path,
        content: viewingFile.content,
      });
      setEditorSaveSuccess(true);
      setTimeout(() => setEditorSaveSuccess(false), 2000);
      loadDirectory(currentPath, activeWindow.id);
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      updateSftpWindow(activeWindow.id, { error: `Failed to save ${viewingFile.name}: ${msg}` });
    } finally {
      setIsEditorSaving(false);
    }
  };

  // Create folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !activeHost || !activeWindow) return;
    const target = `${currentPath.trim().replace(/\/+$/, '')}/${newFolderName.trim()}`;
    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sftp_create_dir', { config, dirPath: target });
    } catch { }

    setShowNewFolderModal(false);
    setNewFolderName('');
    loadDirectory(currentPath, activeWindow.id);
  };

  // Create file
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim() || !activeHost || !activeWindow) return;
    const target = `${currentPath.trim().replace(/\/+$/, '')}/${newFileName.trim()}`;
    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sftp_write_file', { config, filePath: target, content: '' });
    } catch { }

    setShowNewFileModal(false);
    setNewFileName('');
    loadDirectory(currentPath, activeWindow.id);
  };

  // Delete item
  const handleDeleteItem = async () => {
    if (!deletingItem || !activeHost || !activeWindow) return;
    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sftp_delete_file', { config, targetPath: deletingItem.path });
    } catch { }

    setDeletingItem(null);
    loadDirectory(currentPath, activeWindow.id);
  };

  // Rename item
  const handleRenameItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingItem || !renameValue.trim() || !activeHost || !activeWindow) return;
    const parent = currentPath.trim().replace(/\/+$/, '');
    const newPath = `${parent}/${renameValue.trim()}`;
    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sftp_rename_file', { config, oldPath: renamingItem.path, newPath });
    } catch { }

    setRenamingItem(null);
    setRenameValue('');
    loadDirectory(currentPath, activeWindow.id);
  };


  // Clipboard: Copy Item
  const handleCopyItem = (item: RemoteFileItem) => {
    if (!activeHost) return;
    setClipboardItem({ item, sourceHost: activeHost, operation: 'copy' });
    showToast(`Copied "${item.name}". Open target folder and click Paste.`, 'info');
  };

  // Clipboard: Cut Item
  const handleCutItem = (item: RemoteFileItem) => {
    if (!activeHost) return;
    setClipboardItem({ item, sourceHost: activeHost, operation: 'cut' });
    showToast(`Cut "${item.name}". Open target folder and click Paste.`, 'info');
  };

  // Clipboard: Paste Item (supports same server and cross-server transfers)
  const handlePasteClipboard = async () => {
    if (!clipboardItem || !activeHost || !activeWindow) return;
    const targetDir = currentPath.trim().replace(/\/+$/, '') || '/';
    const destPath = `${targetDir === '/' ? '' : targetDir}/${clipboardItem.item.name}`;

    const destConfig = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (clipboardItem.sourceHost.id === activeHost.id) {
        if (clipboardItem.operation === 'copy') {
          await invoke('sftp_copy_file', {
            config: destConfig,
            srcPath: clipboardItem.item.path,
            destPath,
          });
          showToast(`Copied "${clipboardItem.item.name}" to ${destPath}`, 'success');
        } else {
          await invoke('sftp_rename_file', {
            config: destConfig,
            oldPath: clipboardItem.item.path,
            newPath: destPath,
          });
          showToast(`Moved "${clipboardItem.item.name}" to ${destPath}`, 'success');
          setClipboardItem(null);
        }
      } else {
        // Cross-host copy: read from source host and write to destination host
        const srcConfig = {
          hostname: clipboardItem.sourceHost.hostname,
          port: clipboardItem.sourceHost.port || 22,
          username: clipboardItem.sourceHost.username || 'root',
          auth_type: clipboardItem.sourceHost.authMethod,
          key_path: clipboardItem.sourceHost.keyPath || null,
          password: clipboardItem.sourceHost.password || null,
        };
        const content = await invoke<string>('sftp_read_file', {
          config: srcConfig,
          filePath: clipboardItem.item.path,
        });
        await invoke('sftp_write_file', {
          config: destConfig,
          filePath: destPath,
          content,
        });
        if (clipboardItem.operation === 'cut') {
          await invoke('sftp_delete_file', {
            config: srcConfig,
            targetPath: clipboardItem.item.path,
          });
          setClipboardItem(null);
        }
        showToast(
          `Transferred "${clipboardItem.item.name}" from ${clipboardItem.sourceHost.label} to ${activeHost.label}`,
          'success'
        );
      }
      loadDirectory(currentPath, activeWindow.id);
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      showToast(`Paste failed: ${msg}`, 'error');
    }
  };

  // Upload files from Desktop / Finder (used by file picker and drag-and-drop)
  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!activeHost || !activeWindow || !fileList || fileList.length === 0) return;
    setIsUploading(true);
    const targetDir = currentPath.trim().replace(/\/+$/, '') || '/';
    const { invoke } = await import('@tauri-apps/api/core');

    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    let count = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgressText(`Uploading ${file.name} (${i + 1}/${fileList.length})...`);
      try {
        const buffer = await file.arrayBuffer();
        const byteArray = Array.from(new Uint8Array(buffer));
        const destPath = `${targetDir === '/' ? '' : targetDir}/${file.name}`;
        await invoke('sftp_write_file_bytes', {
          config,
          filePath: destPath,
          data: byteArray,
        });
        count++;
      } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
        showToast(`Failed to upload ${file.name}: ${msg}`, 'error');
      }
    }

    setIsUploading(false);
    setUploadProgressText(null);
    if (count > 0) {
      showToast(`Uploaded ${count} file${count > 1 ? 's' : ''} to ${targetDir}`, 'success');
      loadDirectory(currentPath, activeWindow.id);
    }
  };

  const handleDesktopFilePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Container Paste handler: Cmd+V / Ctrl+V to paste local files or clipboard items
  const handleContainerPaste = (e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      uploadFiles(e.clipboardData.files);
    } else if (clipboardItem) {
      e.preventDefault();
      handlePasteClipboard();
    }
  };

  // Download remote file to local filesystem
  const handleDownloadFile = async (item: RemoteFileItem) => {
    if (!activeHost || !activeWindow) return;
    setIsDownloading(item.path);

    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const localPath = await invoke<string>('sftp_download_to_local', {
        config,
        remotePath: item.path,
        localDir: null,
      });
      showToast(`Downloaded "${item.name}" → ${localPath}`, 'success');
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      showToast(`Download failed: ${msg}`, 'error');
    } finally {
      setIsDownloading(null);
    }
  };

  // Internal row drag start (dragging a server file/folder)
  const handleRowDragStart = (e: React.DragEvent, item: RemoteFileItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-sftp-item', JSON.stringify({
      path: item.path,
      name: item.name,
      is_dir: item.is_dir,
    }));
    e.dataTransfer.setData('text/plain', item.path);
  };

  const handleRowDragEnd = () => {
    setDraggedItem(null);
    setDropTargetPath(null);
  };

  // Folder row drop target handlers
  const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetPath(folderPath);
  };

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPath(null);
  };

  const handleFolderDrop = async (e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPath(null);

    // Check if this is an internal SFTP drag (server file → server folder)
    const sftpData = e.dataTransfer.getData('application/x-sftp-item');
    if (sftpData && activeHost && activeWindow) {
      try {
        const parsed = JSON.parse(sftpData);
        const destPath = `${targetFolderPath.replace(/\/+$/, '')}/${parsed.name}`;
        if (parsed.path === destPath) return;

        const config = {
          hostname: activeHost.hostname,
          port: activeHost.port || 22,
          username: activeHost.username || 'root',
          auth_type: activeHost.authMethod,
          key_path: activeHost.keyPath || null,
          password: activeHost.password || null,
        };

        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('sftp_rename_file', {
          config,
          oldPath: parsed.path,
          newPath: destPath,
        });
        showToast(`Moved "${parsed.name}" → ${targetFolderPath}`, 'success');
        loadDirectory(currentPath, activeWindow.id);
      } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
        showToast(`Move failed: ${msg}`, 'error');
      }
      setDraggedItem(null);
      return;
    }

    // External file drop onto a folder (upload directly into that folder)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && activeHost && activeWindow) {
      const originalPath = currentPath;
      const config = {
        hostname: activeHost.hostname,
        port: activeHost.port || 22,
        username: activeHost.username || 'root',
        auth_type: activeHost.authMethod,
        key_path: activeHost.keyPath || null,
        password: activeHost.password || null,
      };
      setIsUploading(true);
      setUploadProgressText(`Uploading to ${targetFolderPath}...`);
      const { invoke } = await import('@tauri-apps/api/core');
      let count = 0;
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        try {
          const buffer = await file.arrayBuffer();
          const byteArray = Array.from(new Uint8Array(buffer));
          const destPath = `${targetFolderPath.replace(/\/+$/, '')}/${file.name}`;
          await invoke('sftp_write_file_bytes', { config, filePath: destPath, data: byteArray });
          count++;
        } catch { }
      }
      setIsUploading(false);
      setUploadProgressText(null);
      if (count > 0) {
        showToast(`Uploaded ${count} file(s) to ${targetFolderPath}`, 'success');
        loadDirectory(originalPath, activeWindow.id);
      }
    }
  };

  // Container-level drag and drop handlers (upload to current dir)
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      // Only show overlay for external drops (not internal SFTP drags)
      if (!draggedItem) {
        setIsDraggingOver(true);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = draggedItem ? 'move' : 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    // If we're dropping a dragged SFTP item onto empty space (not a folder), ignore
    if (draggedItem) {
      setDraggedItem(null);
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  // Open remote file via OS: downloads into local RAM/temp cache and opens via OS default or app chooser
  const handleOpenWithOS = async (
    file: Pick<RemoteFileItem, 'path' | 'name'>,
    mode: 'os_default' | 'os_prompt' | 'reveal' = 'os_default'
  ) => {
    if (!activeHost || !activeWindow) return;
    setOpeningEditorPath(file.path);

    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ local_path: string; editor_name: string; success: boolean }>(
        'sftp_open_in_external_editor',
        {
          config,
          remotePath: file.path,
          editorId: mode,
        }
      );
      if (mode === 'reveal') {
        showToast(`Revealed "${file.name}" in local Finder / Explorer`, 'info');
      } else if (mode === 'os_prompt') {
        showToast(`Choose Application prompt opened for "${file.name}". Saved edits auto-sync!`, 'info');
      } else {
        showToast(
          `Loaded into RAM & opened "${file.name}" in ${result.editor_name}. Saved edits auto-sync to ${activeHost.label}!`,
          'success'
        );
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      showToast(`Failed to open with OS: ${msg}`, 'error');
    } finally {
      setOpeningEditorPath(null);
    }
  };

  // Upload native local paths (dragged & dropped from Desktop / Finder into the app)
  const uploadNativeLocalPaths = async (paths: string[]) => {
    if (!activeHost || !activeWindow || !paths || paths.length === 0) return;
    setIsUploading(true);
    setUploadProgressText(`Uploading ${paths.length} item(s) from Desktop...`);

    const config = {
      hostname: activeHost.hostname,
      port: activeHost.port || 22,
      username: activeHost.username || 'root',
      auth_type: activeHost.authMethod,
      key_path: activeHost.keyPath || null,
      password: activeHost.password || null,
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const count = await invoke<number>('sftp_upload_local_paths', {
        config,
        remoteDir: currentPath,
        localPaths: paths,
      });
      showToast(`Successfully uploaded ${count} item(s) to ${currentPath}`, 'success');
      loadDirectory(currentPath, activeWindow.id);
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      showToast(`Upload failed: ${msg}`, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgressText(null);
    }
  };

  // Native Tauri Drag & Drop listener (intercepts native OS Finder / Desktop drops in Tauri window)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isMounted = true;

    const setupDragDrop = async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const webview = getCurrentWebview();
        const unlistenFn = await webview.onDragDropEvent(async (event) => {
          if (!isMounted) return;
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setIsDraggingOver(true);
          } else if (event.payload.type === 'leave') {
            setIsDraggingOver(false);
          } else if (event.payload.type === 'drop') {
            setIsDraggingOver(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              await uploadNativeLocalPaths(paths);
            }
          }
        });
        unlisten = unlistenFn;
      } catch (err) {
        console.warn('Native drag-drop setup error:', err);
      }
    };

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [activeHost, currentPath, activeWindow?.id]);

  // Open SSH Terminal at host
  const handleOpenTerminalHere = () => {
    if (!activeHost) return;
    connectToSSHHost(activeHost);
  };

  const copyPathToClipboard = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getFileMeta = (item: RemoteFileItem) => {
    const palette = appState.settings?.customPalette;
    const colorCode = palette?.primary || '#d946ef';      // 1st color (Code)
    const colorArchive = palette?.secondary || '#8b5cf6'; // 2nd color (Archives)
    const colorDir = palette?.color3 || '#06b6d4';        // 3rd color (Directories)
    const colorText = palette?.color4 || '#facc15';       // 4th color (Text / Markdown)
    const colorMedia = palette?.color5 || '#f43f5e';      // 5th color (Images / Media)
    const colorExec = palette?.color6 || '#10b981';       // 6th color (Executables)

    if (item.is_dir) {
      return {
        icon: <Folder size={15} color={colorDir} />,
        color: colorDir,
        badge: 'DIR',
        textColor: colorDir,
      };
    }
    const ext = item.name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
      return {
        icon: <FileImage size={15} color={colorMedia} />,
        color: colorMedia,
        badge: ext.toUpperCase(),
        textColor: palette?.text || ColorPalette.textPrimary,
      };
    }
    if (['sh', 'bash', 'zsh', 'bin', 'exe', 'run', 'bat'].includes(ext) || (item.permissions && item.permissions.includes('x'))) {
      return {
        icon: <Terminal size={15} color={colorExec} />,
        color: colorExec,
        badge: 'EXEC',
        textColor: colorExec,
      };
    }
    if (['py', 'rs', 'js', 'ts', 'tsx', 'jsx', 'go', 'c', 'cpp', 'java'].includes(ext)) {
      return {
        icon: <FileCode2 size={15} color={colorCode} />,
        color: colorCode,
        badge: ext.toUpperCase(),
        textColor: palette?.text || ColorPalette.textPrimary,
      };
    }
    if (['json', 'yml', 'yaml', 'toml', 'xml', 'conf', 'ini', 'md', 'txt', 'log', 'env'].includes(ext)) {
      return {
        icon: <FileText size={15} color={colorText} />,
        color: colorText,
        badge: ext.toUpperCase() || 'DOC',
        textColor: palette?.text || ColorPalette.textPrimary,
      };
    }
    if (['tar', 'gz', 'zip', 'bz2', 'xz', '7z'].includes(ext)) {
      return {
        icon: <Archive size={15} color={colorArchive} />,
        color: colorArchive,
        badge: ext.toUpperCase(),
        textColor: palette?.text || ColorPalette.textPrimary,
      };
    }
    return {
      icon: <File size={15} color={palette?.textSecondary || ColorPalette.textSecondary} />,
      color: palette?.textSecondary || ColorPalette.textSecondary,
      badge: ext.toUpperCase() || 'FILE',
      textColor: palette?.textSecondary || ColorPalette.textSecondary,
    };
  };


  const pathSegments = currentPath.split('/').filter(Boolean);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SERVER SELECTION SCREEN (When no window is open or user clicked "New Window")
  // ─────────────────────────────────────────────────────────────────────────────
  if (!activeWindow) {
    return (
      <div
        style={{
          flex: 1,
          height: '100%',
          backgroundColor: ColorPalette.background,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isSidePanel ? '14px 16px' : '22px 28px',
            borderBottom: `1px solid ${ColorPalette.separator}`,
            backgroundColor: ColorPalette.sidebarBackground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '7px',
                backgroundColor: `${primaryColor}18`,
                border: `1px solid ${primaryColor}38`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: primaryColor,
              }}
            >
              <FolderTree size={18} />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--font-size-xl, 15px)', fontWeight: 600, color: ColorPalette.textPrimary, fontFamily: 'var(--font-ui)', margin: 0 }}>
                SFTP Remote File System
              </h1>
              <p style={{ fontSize: 'var(--font-size-sm, 11px)', color: ColorPalette.textSecondary, fontFamily: 'var(--font-ui)', margin: '2px 0 0 0' }}>
                Select an SSH server to open a new remote file system window.
              </p>
            </div>
          </div>

          {isSidePanel && onCloseSidePanel && (
            <button
              onClick={onCloseSidePanel}
              title="Close SFTP Panel"
              style={{
                padding: '6px',
                borderRadius: '6px',
                color: ColorPalette.textMuted,
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Existing Open Sessions Bar */}
        {sftpWindows.length > 0 && (
          <div
            style={{
              padding: '10px 24px',
              backgroundColor: ColorPalette.surfaceElevated,
              borderBottom: `1px solid ${ColorPalette.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              overflowX: 'auto',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, color: ColorPalette.textMuted, textTransform: 'uppercase' }}>
              Open Windows ({sftpWindows.length}):
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
              {sftpWindows.map((win) => (
                <button
                  key={win.id}
                  onClick={() => setActiveSftpWindowId(win.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = ColorPalette.border;
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: ColorPalette.accentGreen }} />
                  <span>{win.host.label}</span>
                  <span style={{ color: ColorPalette.textMuted, fontFamily: 'monospace', fontSize: '10px' }}>
                    {win.currentPath}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Server Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isSidePanel ? '16px' : '28px' }}>
          {sshHosts.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '80%',
                gap: '14px',
                color: ColorPalette.textMuted,
              }}
            >
              <Server size={44} strokeWidth={1.2} color={ColorPalette.textMuted} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: ColorPalette.textSecondary, marginBottom: '6px' }}>
                  No SSH Hosts Configured
                </div>
                <div style={{ fontSize: '12px', color: ColorPalette.textMuted, maxWidth: '320px', lineHeight: 1.5 }}>
                  Add SSH servers in the <strong style={{ color: primaryColor }}>SSH Hosts</strong> panel
                  to browse and manage their files here.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: ColorPalette.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  marginBottom: '14px',
                }}
              >
                Choose an SSH Server to Open Window ({sshHosts.length})
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isSidePanel ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {sshHosts.map((host) => {
                  const alreadyOpen = sftpWindows.some((w) => w.host.id === host.id);
                  return (
                    <button
                      key={host.id}
                      onClick={() => openSftpWindow(host, '/')}
                      style={{
                        padding: '16px 18px',
                        borderRadius: '10px',
                        backgroundColor: ColorPalette.surfaceElevated,
                        border: `1px solid ${alreadyOpen ? `${primaryColor}55` : ColorPalette.border}`,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.16s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = primaryColor;
                        e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = `0 4px 16px ${primaryColor}22`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = alreadyOpen ? `${primaryColor}55` : ColorPalette.border;
                        e.currentTarget.style.backgroundColor = ColorPalette.surfaceElevated;
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: '2px',
                          backgroundColor: primaryColor,
                          opacity: alreadyOpen ? 1 : 0.3,
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            backgroundColor: `${primaryColor}14`,
                            border: `1px solid ${primaryColor}28`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Server size={16} color={primaryColor} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 700,
                                color: ColorPalette.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {host.label}
                            </div>
                            {alreadyOpen && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: primaryColor,
                                  backgroundColor: `${primaryColor}18`,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                }}
                              >
                                CONNECTED
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: ColorPalette.textMuted,
                              fontFamily: "'JetBrains Mono', monospace",
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {host.username}@{host.hostname}:{host.port || 22}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '5px',
                            textTransform: 'uppercase',
                            backgroundColor:
                              host.authMethod === 'password'
                                ? `${ColorPalette.accentYellow}18`
                                : `${ColorPalette.accentBlue}18`,
                            color:
                              host.authMethod === 'password'
                                ? ColorPalette.accentYellow
                                : ColorPalette.accentBlue,
                          }}
                        >
                          {host.authMethod === 'password' ? 'Password' : 'SSH Key'}
                        </span>
                        {host.tags?.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: `${primaryColor}14`,
                              color: ColorPalette.textMuted,
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ACTIVE SFTP WINDOW BROWSER (Tabs Bar + File Explorer + Persistent Navigation)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      onPaste={handleContainerPaste}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: ColorPalette.background,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Hidden file input for uploading from desktop/Finder */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleDesktopFilePickerChange}
        style={{ display: 'none' }}
      />

      {/* ─── WINDOW SESSION TABS BAR ─── */}
      <div
        style={{
          height: 'var(--tab-height, 38px)',
          backgroundColor: ColorPalette.sidebarBackground,
          borderBottom: `1px solid ${ColorPalette.separator}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          userSelect: 'none',
          gap: '4px',
          overflowX: 'auto',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {sftpWindows.map((win) => {
            const isTabActive = win.id === activeSftpWindowId;
            return (
              <div
                key={win.id}
                onClick={() => setActiveSftpWindowId(win.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px 6px 0 0',
                  backgroundColor: isTabActive ? ColorPalette.background : 'transparent',
                  color: isTabActive ? ColorPalette.textPrimary : ColorPalette.textSecondary,
                  borderTop: isTabActive ? `2px solid ${primaryColor}` : '2px solid transparent',
                  borderLeft: isTabActive ? `1px solid ${ColorPalette.border}` : '1px solid transparent',
                  borderRight: isTabActive ? `1px solid ${ColorPalette.border}` : '1px solid transparent',
                  fontSize: 'var(--tab-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: isTabActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  minWidth: '130px',
                  maxWidth: '220px',
                }}
                onMouseEnter={(e) => {
                  if (!isTabActive) e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  if (!isTabActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: ColorPalette.accentGreen,
                    boxShadow: isTabActive ? `0 0 6px ${ColorPalette.accentGreen}` : 'none',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {win.host.label}
                </span>
                <span
                  style={{
                    fontSize: 'var(--font-size-xs, 10px)',
                    color: ColorPalette.textMuted,
                    fontFamily: 'var(--font-mono)',
                    maxWidth: '65px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {win.currentPath === '/' ? '/' : win.currentPath.split('/').filter(Boolean).pop() || '/'}
                </span>
                <button
                  type="button"
                  title="Close SFTP Window"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSftpWindow(win.id);
                  }}
                  style={{
                    width: '15px',
                    height: '15px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: ColorPalette.textMuted,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = ColorPalette.accentRed;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = ColorPalette.textMuted;
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}

          {/* New Window Session Button */}
          <button
            title="Open New Server Window"
            onClick={() => setActiveSftpWindowId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: `1px dashed ${ColorPalette.border}`,
              color: ColorPalette.textSecondary,
              fontSize: 'var(--btn-font-size, 11px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
              e.currentTarget.style.color = ColorPalette.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = ColorPalette.textSecondary;
            }}
          >
            <Plus size={13} />
            <span>New Window</span>
          </button>
        </div>

        {/* Right Action Icons in Window Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          {/* Dock / Undock Side Window Button */}
          {!isSidePanel ? (
            <button
              title="Dock as Side Window alongside Terminal"
              onClick={() => {
                if (onDockToSidePanel) {
                  onDockToSidePanel();
                } else {
                  setShowSftpSidePanel(true);
                  setSelectedTool(null);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 8px',
                borderRadius: '5px',
                backgroundColor: ColorPalette.surfaceElevated,
                border: `1px solid ${ColorPalette.border}`,
                color: ColorPalette.textSecondary,
                fontSize: 'var(--btn-font-size, 11px)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Columns3 size={13} color={ColorPalette.accentCyan} />
              <span>Side Window</span>
            </button>
          ) : (
            <>
              {onExpandToFullView && (
                <button
                  title="Expand to Full SFTP View"
                  onClick={onExpandToFullView}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '5px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  <Maximize2 size={13} />
                </button>
              )}
              {onCloseSidePanel && (
                <button
                  title="Close SFTP Side Window"
                  onClick={onCloseSidePanel}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '5px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  <PanelRightClose size={13} />
                </button>
              )}
            </>
          )}

          {/* Open SSH Terminal */}
          <button
            title="Open Interactive SSH Terminal for this server"
            onClick={handleOpenTerminalHere}
            style={{
              padding: '4px 6px',
              borderRadius: '5px',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.accentGreen,
              cursor: 'pointer',
            }}
          >
            <Terminal size={13} />
          </button>
        </div>
      </div>

      {/* ─── NAVIGATION BAR (Path, History, Breadcrumbs, Search) ─── */}
      <div
        style={{
          padding: isSidePanel ? '8px 12px' : '10px 18px',
          borderBottom: `1px solid ${ColorPalette.border}`,
          backgroundColor: ColorPalette.background,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'nowrap',
        }}
      >
        {/* History Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <button
            onClick={navigateBack}
            disabled={historyIdx <= 0}
            title="Back"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: historyIdx > 0 ? ColorPalette.textPrimary : ColorPalette.textMuted,
              cursor: historyIdx > 0 ? 'pointer' : 'default',
              opacity: historyIdx > 0 ? 1 : 0.4,
            }}
          >
            <ArrowLeft size={13} />
          </button>
          <button
            onClick={navigateForward}
            disabled={historyIdx >= history.length - 1}
            title="Forward"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: historyIdx < history.length - 1 ? ColorPalette.textPrimary : ColorPalette.textMuted,
              cursor: historyIdx < history.length - 1 ? 'pointer' : 'default',
              opacity: historyIdx < history.length - 1 ? 1 : 0.4,
            }}
          >
            <ArrowRight size={13} />
          </button>
          <button
            onClick={navigateUp}
            disabled={currentPath === '/' || currentPath === ''}
            title="Up directory"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: currentPath !== '/' ? ColorPalette.textPrimary : ColorPalette.textMuted,
              cursor: currentPath !== '/' ? 'pointer' : 'default',
              opacity: currentPath !== '/' ? 1 : 0.4,
            }}
          >
            <ArrowUp size={13} />
          </button>
          <button
            onClick={() => navigateTo('/')}
            title="Root (/)"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.textSecondary,
              cursor: 'pointer',
            }}
          >
            <Home size={13} />
          </button>
        </div>

        {/* Breadcrumb Path Bar */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: ColorPalette.surfaceElevated,
            border: `1px solid ${ColorPalette.border}`,
            borderRadius: '6px',
            padding: '3px 8px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <button
            onClick={() => navigateTo('/')}
            style={{
              color: ColorPalette.accentCyan,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              padding: '0 3px',
            }}
          >
            /
          </button>
          {pathSegments.map((segment, idx) => {
            const segPath = '/' + pathSegments.slice(0, idx + 1).join('/');
            const isLast = idx === pathSegments.length - 1;
            return (
              <React.Fragment key={segPath}>
                <ChevronRight size={11} color={ColorPalette.textMuted} style={{ flexShrink: 0 }} />
                <button
                  onClick={() => navigateTo(segPath)}
                  style={{
                    color: isLast ? ColorPalette.textPrimary : ColorPalette.textSecondary,
                    fontWeight: isLast ? 700 : 500,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 3px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {segment}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Copy Path */}
        <button
          onClick={() => copyPathToClipboard(currentPath)}
          title="Copy current path"
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ColorPalette.surfaceElevated,
            border: `1px solid ${ColorPalette.border}`,
            color: copiedPath === currentPath ? ColorPalette.accentGreen : ColorPalette.textMuted,
            cursor: 'pointer',
          }}
        >
          {copiedPath === currentPath ? <CheckCheck size={13} /> : <Copy size={13} />}
        </button>

        {/* Refresh */}
        <button
          onClick={() => loadDirectory(currentPath)}
          title="Refresh Directory"
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ColorPalette.surfaceElevated,
            border: `1px solid ${ColorPalette.border}`,
            color: ColorPalette.textSecondary,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ─── ACTION TOOLBAR (Search, New Folder, New File) ─── */}
      <div
        style={{
          padding: isSidePanel ? '6px 12px' : '8px 18px',
          borderBottom: `1px solid ${ColorPalette.border}`,
          backgroundColor: ColorPalette.sidebarBackground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        {/* Search Filter */}
        <div style={{ position: 'relative', width: isSidePanel ? '150px' : '220px' }}>
          <Search size={12} color={ColorPalette.textMuted} style={{ position: 'absolute', left: '8px', top: '7px' }} />
          <input
            type="text"
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => updateSftpWindow(activeWindow.id, { searchQuery: e.target.value })}
            style={{
              width: '100%',
              padding: '4px 8px 4px 26px',
              borderRadius: '5px',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.textPrimary,
              fontSize: '11px',
              outline: 'none',
            }}
          />
        </div>

        {/* Action Buttons: Upload, Paste, IDE Preference, New Folder, New File */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Upload from Desktop button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload file(s) from your desktop / local machine"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              borderRadius: '5px',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.textPrimary,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Upload size={12} color={ColorPalette.accentBlue} />
            <span>Upload</span>
          </button>

          {/* Paste button */}
          <button
            onClick={handlePasteClipboard}
            disabled={!clipboardItem}
            title={
              clipboardItem
                ? `Paste "${clipboardItem.item.name}" into current directory (${currentPath})`
                : 'Clipboard is empty (copy or cut a file first)'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              borderRadius: '5px',
              backgroundColor: clipboardItem ? `${primaryColor}22` : ColorPalette.surfaceElevated,
              border: `1px solid ${clipboardItem ? primaryColor : ColorPalette.border}`,
              color: clipboardItem ? primaryColor : ColorPalette.textMuted,
              fontSize: '11px',
              fontWeight: 600,
              cursor: clipboardItem ? 'pointer' : 'default',
              opacity: clipboardItem ? 1 : 0.6,
            }}
          >
            <ClipboardPaste size={12} />
            <span>Paste{clipboardItem ? ' (1)' : ''}</span>
          </button>


          <button
            onClick={() => setShowNewFolderModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              borderRadius: '5px',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.textPrimary,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Folder size={12} color={primaryColor} />
            <span>New Folder</span>
          </button>
          <button
            onClick={() => setShowNewFileModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              borderRadius: '5px',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.textPrimary,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={12} color={ColorPalette.accentGreen} />
            <span>New File</span>
          </button>
        </div>
      </div>

      {/* ─── CLIPBOARD PENDING BANNER ─── */}
      {clipboardItem && (
        <div
          style={{
            padding: '6px 14px',
            backgroundColor: `${primaryColor}18`,
            borderBottom: `1px solid ${primaryColor}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: primaryColor,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                flexShrink: 0,
              }}
            >
              {clipboardItem.operation === 'copy' ? '📋 Copied' : '✂️ Cut'}:
            </span>
            <span
              style={{
                color: ColorPalette.textPrimary,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {clipboardItem.item.name}
            </span>
            <span style={{ color: ColorPalette.textMuted, fontSize: '10px', flexShrink: 0 }}>
              (from {clipboardItem.sourceHost.label})
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={handlePasteClipboard}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '5px',
                backgroundColor: primaryColor,
                color: '#090b10',
                border: 'none',
                fontWeight: 600,
                fontSize: 'var(--font-size-xs, 10px)',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <ClipboardPaste size={11} />
              <span>Paste Here</span>
            </button>
            <button
              onClick={() => setClipboardItem(null)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                border: `1px solid ${ColorPalette.border}`,
                color: ColorPalette.textMuted,
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── UPLOADING PROGRESS BANNER ─── */}
      {isUploading && (
        <div
          style={{
            padding: '6px 14px',
            backgroundColor: `${ColorPalette.accentBlue}22`,
            borderBottom: `1px solid ${ColorPalette.accentBlue}55`,
            color: ColorPalette.accentBlue,
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Loader2 size={13} className="animate-spin" />
          <span>{uploadProgressText || 'Uploading desktop files to remote server...'}</span>
        </div>
      )}

      {/* ─── ERROR BANNER ─── */}
      {error && (
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: `${ColorPalette.accentRed}18`,
            borderBottom: `1px solid ${ColorPalette.accentRed}44`,
            color: ColorPalette.accentRed,
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {error}
            </span>
          </div>
          <button
            onClick={() => loadDirectory(currentPath)}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: ColorPalette.accentRed,
              color: '#ffffff',
              border: 'none',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── FILE LIST TABLE ─── */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* Drag & Drop Visual Dropzone Overlay */}
        {isDraggingOver && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(10, 14, 23, 0.88)',
              backdropFilter: 'blur(4px)',
              border: `2px dashed ${primaryColor}`,
              borderRadius: '8px',
              margin: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              zIndex: 50,
              pointerEvents: 'none',
              boxShadow: `0 0 35px ${primaryColor}33`,
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: `${primaryColor}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: primaryColor,
                boxShadow: `0 0 20px ${primaryColor}44`,
              }}
            >
              <UploadCloud size={32} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: ColorPalette.textPrimary }}>
                Drop files here to upload to remote server
              </div>
              <div style={{ fontSize: '12px', color: primaryColor, fontFamily: 'monospace', marginTop: '4px' }}>
                Target: {currentPath}
              </div>
              <div style={{ fontSize: '11px', color: ColorPalette.textMuted, marginTop: '2px' }}>
                Files will be transferred directly via SFTP
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: `${ColorPalette.background}cc`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              zIndex: 10,
              color: ColorPalette.accentCyan,
              fontSize: '12px',
            }}
          >
            <Loader2 size={18} className="animate-spin" />
            <span>Reading remote file system...</span>
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
          <thead>
            <tr
              style={{
                borderBottom: `1px solid ${ColorPalette.border}`,
                color: ColorPalette.textMuted,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: '10px',
              }}
            >
              <th style={{ padding: '8px 14px' }}>Name</th>
              <th style={{ padding: '8px 14px', width: '90px' }}>Size</th>
              {!isSidePanel && <th style={{ padding: '8px 14px', width: '100px' }}>Permissions</th>}
              {!isSidePanel && <th style={{ padding: '8px 14px', width: '140px' }}>Modified</th>}
              <th style={{ padding: '8px 14px', width: isSidePanel ? '130px' : '170px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={isSidePanel ? 3 : 5} style={{ padding: '40px', textAlign: 'center', color: ColorPalette.textMuted }}>
                  <Folder size={28} color={ColorPalette.textMuted} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  {searchQuery ? 'No matching files found' : 'This folder is empty'}
                </td>
              </tr>
            ) : (
              filteredFiles.map((item) => (
                <tr
                  key={item.path}
                  draggable
                  onDragStart={(e) => handleRowDragStart(e, item)}
                  onDragEnd={handleRowDragEnd}
                  onDragOver={item.is_dir ? (e) => handleFolderDragOver(e, item.path) : undefined}
                  onDragLeave={item.is_dir ? handleFolderDragLeave : undefined}
                  onDrop={item.is_dir ? (e) => handleFolderDrop(e, item.path) : undefined}
                  onDoubleClick={() => {
                    if (item.is_dir) {
                      navigateTo(item.path);
                    } else {
                      handleOpenWithOS(item, 'os_default');
                    }
                  }}
                  style={{
                    borderBottom: `1px solid ${ColorPalette.border}44`,
                    transition: 'all 0.15s ease',
                    cursor: 'grab',
                    backgroundColor: dropTargetPath === item.path
                      ? `${primaryColor}22`
                      : draggedItem?.path === item.path
                        ? `${primaryColor}15`
                        : 'transparent',
                    borderLeft: dropTargetPath === item.path
                      ? `3px solid ${primaryColor}`
                      : '3px solid transparent',
                    opacity: draggedItem?.path === item.path ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (dropTargetPath !== item.path && draggedItem?.path !== item.path) {
                      e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (dropTargetPath !== item.path && draggedItem?.path !== item.path) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <td style={{ padding: '6px 14px' }}>
                    {(() => {
                      const meta = getFileMeta(item);
                      return (
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: item.is_dir ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (item.is_dir) navigateTo(item.path);
                          }}
                        >
                          <GripVertical
                            size={12}
                            color={ColorPalette.textMuted}
                            style={{
                              cursor: 'grab',
                              opacity: 0.4,
                              flexShrink: 0,
                              transition: 'opacity 0.15s ease',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as SVGElement).style.opacity = '1'; }}
                            onMouseLeave={(e) => { (e.currentTarget as SVGElement).style.opacity = '0.4'; }}
                          />
                          {meta.icon}
                          <span
                            style={{
                              fontWeight: item.is_dir ? 600 : 400,
                              color: meta.textColor,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: isSidePanel ? '120px' : '300px',
                            }}
                          >
                            {item.name}
                          </span>
                          {dropTargetPath === item.path && item.is_dir && (
                            <span
                              style={{
                                fontSize: '8px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '3px',
                                backgroundColor: `${primaryColor}28`,
                                color: primaryColor,
                                border: `1px solid ${primaryColor}55`,
                                animation: 'pulse 1s infinite',
                              }}
                            >
                              DROP HERE
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '8px',
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: '3px',
                              backgroundColor: `${meta.color}1c`,
                              color: meta.color,
                              border: `1px solid ${meta.color}33`,
                              fontFamily: 'monospace',
                              marginLeft: 'auto',
                            }}
                          >
                            {meta.badge}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '6px 14px', color: ColorPalette.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.is_dir ? '—' : formatSize(item.size)}
                  </td>
                  {!isSidePanel && (
                    <td style={{ padding: '6px 14px', color: ColorPalette.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                      {item.permissions || '—'}
                    </td>
                  )}
                  {!isSidePanel && (
                    <td style={{ padding: '6px 14px', color: ColorPalette.textMuted, whiteSpace: 'nowrap' }}>
                      {item.modified || '—'}
                    </td>
                  )}
                  <td style={{ padding: '6px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                      {!item.is_dir && (
                        <>
                          {/* Download to local machine */}
                          <button
                            title="Download to local Downloads folder"
                            onClick={() => handleDownloadFile(item)}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: ColorPalette.accentGreen,
                              cursor: 'pointer',
                            }}
                          >
                            {isDownloading === item.path ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} />
                            )}
                          </button>
                          {/* Open in OS Default App */}
                          <button
                            title="Load into RAM & Open with OS Default App (auto-syncs on save)"
                            onClick={() => handleOpenWithOS(item, 'os_default')}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: primaryColor,
                              cursor: 'pointer',
                            }}
                          >
                            {openingEditorPath === item.path ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <ExternalLink size={12} />
                            )}
                          </button>
                          {/* Choose App via OS prompt */}
                          <button
                            title="Ask OS which application to open with (Open With... dialog)"
                            onClick={() => handleOpenWithOS(item, 'os_prompt')}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: ColorPalette.accentBlue,
                              cursor: 'pointer',
                            }}
                          >
                            <Code size={12} />
                          </button>
                          {/* Reveal in local Finder / Explorer */}
                          <button
                            title="Reveal cached file in Finder / Explorer"
                            onClick={() => handleOpenWithOS(item, 'reveal')}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: ColorPalette.textMuted,
                              cursor: 'pointer',
                            }}
                          >
                            <FolderTree size={12} />
                          </button>
                          {/* Built-in quick preview */}
                          <button
                            title="Quick View (Built-in Viewer)"
                            onClick={() => handleOpenFile(item)}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: ColorPalette.accentCyan,
                              cursor: 'pointer',
                            }}
                          >
                            <Eye size={12} />
                          </button>
                        </>
                      )}
                      {/* Download directory */}
                      {item.is_dir && (
                        <button
                          title="Download folder to local Downloads"
                          onClick={() => handleDownloadFile(item)}
                          style={{
                            padding: '3px 5px',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: ColorPalette.accentGreen,
                            cursor: 'pointer',
                          }}
                        >
                          {isDownloading === item.path ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                        </button>
                      )}
                      {/* Copy */}
                      <button
                        title="Copy to clipboard"
                        onClick={() => handleCopyItem(item)}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: ColorPalette.textSecondary,
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={12} />
                      </button>
                      {/* Cut */}
                      <button
                        title="Cut / Move item"
                        onClick={() => handleCutItem(item)}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: ColorPalette.textSecondary,
                          cursor: 'pointer',
                        }}
                      >
                        <Scissors size={12} />
                      </button>
                      {/* Rename */}
                      <button
                        title="Rename"
                        onClick={() => {
                          setRenamingItem(item);
                          setRenameValue(item.name);
                        }}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: ColorPalette.textMuted,
                          cursor: 'pointer',
                        }}
                      >
                        <Edit2 size={12} />
                      </button>
                      {/* Delete */}
                      <button
                        title="Delete"
                        onClick={() => setDeletingItem(item)}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: ColorPalette.accentRed,
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── BOTTOM STATUS BAR ─── */}
      <div
        style={{
          padding: '4px 14px',
          borderTop: `1px solid ${ColorPalette.separator}`,
          backgroundColor: ColorPalette.sidebarBackground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: ColorPalette.textMuted,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>{files.length} items</span>
          <span>•</span>
          <span style={{ color: ColorPalette.accentGreen }}>● Connected to {activeHost?.label || 'Host'}</span>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {activeHost ? `${activeHost.username}@${activeHost.hostname}:${activeHost.port || 22}` : ''}
        </div>
      </div>

      {/* ─── FILE VIEWER / EDITOR MODAL ─── */}
      {viewingFile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
        >
          <div
            style={{
              width: '80vw',
              maxWidth: '900px',
              height: '80vh',
              backgroundColor: ColorPalette.background,
              borderRadius: '12px',
              border: `1px solid ${ColorPalette.border}`,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderBottom: `1px solid ${ColorPalette.border}`,
                backgroundColor: ColorPalette.sidebarBackground,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} color={primaryColor} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: ColorPalette.textPrimary }}>
                  {viewingFile.name}
                </span>
                <span style={{ fontSize: '11px', color: ColorPalette.textMuted, fontFamily: 'monospace' }}>
                  ({viewingFile.path})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editorSaveSuccess && (
                  <span style={{ fontSize: '11px', color: ColorPalette.accentGreen, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={12} /> Saved!
                  </span>
                )}
                {/* Button to open with OS default app from viewer */}
                <button
                  onClick={() => {
                    handleOpenWithOS(viewingFile, 'os_default');
                  }}
                  title="Load into RAM & Open with OS Default App (auto-syncs on save)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    color: primaryColor,
                    border: `1px solid ${ColorPalette.border}`,
                    fontWeight: 600,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  <ExternalLink size={12} />
                  <span>Open with OS</span>
                </button>
                <button
                  onClick={handleSaveFile}
                  disabled={isEditorSaving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    backgroundColor: primaryColor,
                    color: '#090b10',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: isEditorSaving ? 'default' : 'pointer',
                  }}
                >
                  <Save size={13} />
                  <span>{isEditorSaving ? 'Saving...' : 'Save File'}</span>
                </button>
                <button
                  onClick={() => setViewingFile(null)}
                  style={{
                    padding: '5px',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: ColorPalette.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <textarea
              value={viewingFile.content}
              onChange={(e) => setViewingFile({ ...viewingFile, content: e.target.value })}
              style={{
                flex: 1,
                width: '100%',
                padding: '14px',
                backgroundColor: ColorPalette.surfaceElevated,
                color: ColorPalette.textPrimary,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                lineHeight: 1.5,
                border: 'none',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* ─── NEW FOLDER MODAL ─── */}
      {showNewFolderModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={handleCreateFolder}
            style={{
              width: '360px',
              backgroundColor: ColorPalette.surfaceElevated,
              borderRadius: '10px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: ColorPalette.textPrimary }}>
              Create Remote Directory
            </div>
            <input
              type="text"
              autoFocus
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: ColorPalette.background,
                border: `1px solid ${ColorPalette.border}`,
                color: ColorPalette.textPrimary,
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${ColorPalette.border}`,
                  color: ColorPalette.textSecondary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: primaryColor,
                  color: '#090b10',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 'var(--btn-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── NEW FILE MODAL ─── */}
      {showNewFileModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={handleCreateFile}
            style={{
              width: '360px',
              backgroundColor: ColorPalette.surfaceElevated,
              borderRadius: '10px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: ColorPalette.textPrimary }}>
              Create Remote File
            </div>
            <input
              type="text"
              autoFocus
              placeholder="Filename (e.g. app.py, notes.txt)"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: ColorPalette.background,
                border: `1px solid ${ColorPalette.border}`,
                color: ColorPalette.textPrimary,
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowNewFileModal(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${ColorPalette.border}`,
                  color: ColorPalette.textSecondary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: primaryColor,
                  color: '#090b10',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 'var(--btn-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── RENAME MODAL ─── */}
      {renamingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={handleRenameItem}
            style={{
              width: '360px',
              backgroundColor: ColorPalette.surfaceElevated,
              borderRadius: '10px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: ColorPalette.textPrimary }}>
              Rename Item
            </div>
            <input
              type="text"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: ColorPalette.background,
                border: `1px solid ${ColorPalette.border}`,
                color: ColorPalette.textPrimary,
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRenamingItem(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${ColorPalette.border}`,
                  color: ColorPalette.textSecondary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: primaryColor,
                  color: '#090b10',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 'var(--btn-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Rename
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── DELETE CONFIRM MODAL ─── */}
      {deletingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '380px',
              backgroundColor: ColorPalette.surfaceElevated,
              borderRadius: '10px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: ColorPalette.accentRed }}>
              Confirm Remote Deletion
            </div>
            <div style={{ fontSize: '12px', color: ColorPalette.textSecondary, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete{' '}
              <strong style={{ color: ColorPalette.textPrimary }}>{deletingItem.name}</strong> from {activeHost?.label || 'host'}?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setDeletingItem(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${ColorPalette.border}`,
                  color: ColorPalette.textSecondary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteItem}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: ColorPalette.accentRed,
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ─── FLOATING TOAST NOTIFICATION ─── */}
      {statusToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '22px',
            right: '22px',
            padding: '10px 16px',
            borderRadius: '8px',
            backgroundColor: ColorPalette.surfaceElevated,
            border: `1px solid ${statusToast.type === 'error'
                ? ColorPalette.accentRed
                : statusToast.type === 'success'
                  ? ColorPalette.accentGreen
                  : primaryColor
              }`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 2000,
            maxWidth: '440px',
          }}
        >
          {statusToast.type === 'error' ? (
            <AlertCircle size={15} color={ColorPalette.accentRed} style={{ flexShrink: 0 }} />
          ) : statusToast.type === 'success' ? (
            <Check size={15} color={ColorPalette.accentGreen} style={{ flexShrink: 0 }} />
          ) : (
            <Loader2 size={15} color={primaryColor} style={{ flexShrink: 0 }} />
          )}
          <span style={{ fontSize: '12px', color: ColorPalette.textPrimary, lineHeight: 1.4 }}>
            {statusToast.message}
          </span>
          <button
            onClick={() => setStatusToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: ColorPalette.textMuted,
              cursor: 'pointer',
              padding: '2px',
              marginLeft: 'auto',
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
