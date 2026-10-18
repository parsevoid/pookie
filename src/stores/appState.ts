import { useState, useEffect, useCallback } from 'react';
import { type Connection, createConnection, type SSHAuthType } from '../models/Connection';
import type { SSHHost } from '../models/SSHHost';
import type { SSHKey } from '../models/SSHKey';
import { type Snippet, createSnippet } from '../models/Snippet';
import { type SFTPWindow, createSFTPWindow } from '../models/SFTPWindow';

import { type CustomColorPalette, DEFAULT_PALETTE, type UiSizePreset } from '../styles/theme';
import { saveCustomWallpaperToDb, getCustomWallpaperFromDb } from '../utils/wallpaperStorage';
import {
  openDetachedTerminalWindow,
  focusDetachedWindow,
  closeDetachedWindow,
  WINDOW_BROADCAST_CHANNEL,
  type WindowBroadcastMessage,
} from '../utils/windowManager';

function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[Storage] Failed to save key "${key}" to localStorage:`, err);
    return false;
  }
}

export type SidebarTool = 'sshHosts' | 'sshKeys' | 'sftp' | 'snippets' | 'history' | null;

export interface TerminalTab {
  id: string;
  title: string;
  connectionId: string;
  createdAt: number;
  isPoppedUp?: boolean;
}

export interface AppSettings {
  fontSize: number;
  fontFamily: string;
  sizePreset?: UiSizePreset;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  theme: string;
  aiModel: string;
  reasoningModel?: string;
  temperature: number;
  // UI & Aesthetic Customization
  backgroundOpacity: number;       // 0.05 to 1.0
  backgroundImage: string;        // 'none' | 'cyberpunk' | 'custom'
  backgroundCustomUrl?: string;   // Image URL or base64 data
  backgroundBlur: number;         // 0 to 20 px
  customPalette: CustomColorPalette;
  activeCritiqueBadge: 'gov_door' | 'blackhat_puppet' | 'none';
}

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 13,
  fontFamily: 'JetBrains Mono',
  sizePreset: 'standard',
  cursorStyle: 'block',
  cursorBlink: true,
  theme: 'Pookie Cyberpunk',
  aiModel: 'ternary-bonsai-1.7b',
  reasoningModel: 'ternary-bonsai-27b',
  temperature: 0.2,
  backgroundOpacity: 0.88,
  backgroundImage: 'cyberpunk',
  backgroundCustomUrl: '',
  backgroundBlur: 0,
  customPalette: DEFAULT_PALETTE,
  activeCritiqueBadge: 'gov_door',
};

export const INITIAL_CONNECTIONS: Connection[] = [
  createConnection({
    id: 'conn-local',
    name: 'Local Shell',
    hostname: 'localhost',
    type: 'local',
    status: 'connected',
    sortOrder: 0,
  }),
];

export const INITIAL_SNIPPETS: Snippet[] = [
  createSnippet({
    id: 'snip-1',
    title: 'Docker Cleanup Unused Containers & Images',
    content: 'docker system prune -a --volumes -f',
    description: 'Remove all stopped containers, unused networks, and dangling images.',
    tags: ['docker', 'clean'],
    category: 'Docker',
  }),
  createSnippet({
    id: 'snip-2',
    title: 'Find Top 10 Memory Consuming Processes',
    content: 'ps aux --sort=-%mem | head -n 11',
    description: 'List the processes consuming the most RAM in descending order.',
    tags: ['system', 'perf'],
    category: 'Linux',
  }),
  createSnippet({
    id: 'snip-3',
    title: 'Check Listening Ports and Services',
    content: 'lsof -iTCP -sTCP:LISTEN -P -n',
    description: 'Show open TCP sockets and listening network ports.',
    tags: ['network', 'ports'],
    category: 'Network',
  }),
  createSnippet({
    id: 'snip-4',
    title: 'Git Undo Last Commit (Keep Changes)',
    content: 'git reset --soft HEAD~1',
    description: 'Rollback commit but keep modified files staged.',
    tags: ['git', 'undo'],
    category: 'Git',
  }),
  createSnippet({
    id: 'snip-5',
    title: 'Kubernetes Pod Logs Follow',
    content: 'kubectl logs -f -l app=my-service --tail=100',
    description: 'Stream live logs from multiple pods matching a label selector.',
    tags: ['k8s', 'logs'],
    category: 'DevOps',
  }),
];

const INITIAL_HISTORY: { id: string; command: string; timestamp: number }[] = [
  { id: 'hist-1', command: 'git status', timestamp: Date.now() - 3600000 },
  { id: 'hist-2', command: 'npm run dev', timestamp: Date.now() - 1800000 },
  { id: 'hist-3', command: 'docker ps -a', timestamp: Date.now() - 900000 },
];

export function useAppState() {
  const [selectedTool, setSelectedTool] = useState<SidebarTool>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('conn-local');
  const [connections, setConnections] = useState<Connection[]>(() => {
    const saved = localStorage.getItem('myterminal_connections');
    return saved ? JSON.parse(saved) : INITIAL_CONNECTIONS;
  });

  const [tabs, setTabs] = useState<TerminalTab[]>([
    {
      id: 'tab-1',
      title: 'Local Shell',
      connectionId: 'conn-local',
      createdAt: Date.now(),
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  const [sshHosts, setSshHosts] = useState<SSHHost[]>(() => {
    const saved = localStorage.getItem('myterminal_hosts');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((h: SSHHost) => h.id !== 'host-1' && h.id !== 'host-2')
        : [];
    } catch {
      return [];
    }
  });

  const [sshKeys, setSshKeys] = useState<SSHKey[]>(() => {
    const saved = localStorage.getItem('myterminal_keys');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((k: SSHKey) => k.id !== 'key-1' && k.id !== 'key-2') : [];
    } catch {
      return [];
    }
  });

  const [selectedSftpHost, setSelectedSftpHost] = useState<SSHHost | null>(null);

  const [sftpWindows, setSftpWindows] = useState<SFTPWindow[]>(() => {
    try {
      const saved = localStorage.getItem('myterminal_sftp_windows');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((w: SFTPWindow) => ({
            ...w,
            isLoading: false,
            error: null,
          }));
        }
      }
    } catch {}
    return [];
  });

  const [activeSftpWindowId, setActiveSftpWindowId] = useState<string | null>(() => {
    return localStorage.getItem('myterminal_sftp_active_window') || null;
  });

  const [showSftpSidePanel, setShowSftpSidePanel] = useState<boolean>(() => {
    return localStorage.getItem('myterminal_sftp_side_panel') === 'true';
  });

  const [sftpSidePanelWidth, setSftpSidePanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('myterminal_sftp_side_panel_width');
    return saved ? parseInt(saved, 10) : 460;
  });
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    const saved = localStorage.getItem('myterminal_snippets');
    return saved ? JSON.parse(saved) : INITIAL_SNIPPETS;
  });

  const [history, setHistory] = useState<{ id: string; command: string; timestamp: number }[]>(() => {
    const saved = localStorage.getItem('myterminal_history');
    return saved ? JSON.parse(saved) : INITIAL_HISTORY;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('pookie_settings') || localStorage.getItem('myterminal_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validModelIds = new Set([
          'granite-3.3-2b',
          'qwen2.5-coder-1.5b',
          'smollm2-360m',
          'smollm2-3b',
          'qwen3-1.7b',
          'qwen3-4b',
          'qwen3-8b',
          'ternary-bonsai-1.7b',
          'ternary-bonsai-27b',
        ]);
        const aiModel = parsed.aiModel && validModelIds.has(parsed.aiModel)
          ? parsed.aiModel
          : DEFAULT_SETTINGS.aiModel;
        const reasoningModel = parsed.reasoningModel && validModelIds.has(parsed.reasoningModel)
          ? parsed.reasoningModel
          : DEFAULT_SETTINGS.reasoningModel;

        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          aiModel,
          reasoningModel,
          sizePreset: parsed.sizePreset || 'standard',
          customPalette: {
            ...DEFAULT_SETTINGS.customPalette,
            ...(parsed.customPalette || {}),
          },
        };
      } catch {}
    }
    return DEFAULT_SETTINGS;
  });

  const [showNewConnection, setShowNewConnection] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'models' | 'system'>('appearance');
  const [showAIPalette, setShowAIPalette] = useState(false);
  const [showSnippetPalette, setShowSnippetPalette] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);

  // Command runner callback registered by TerminalView
  const [commandExecutors, setCommandExecutors] = useState<Map<string, (cmd: string) => void>>(new Map());

  const registerExecutor = useCallback((tabId: string, fn: (cmd: string) => void) => {
    setCommandExecutors((prev) => {
      const next = new Map(prev);
      next.set(tabId, fn);
      return next;
    });
  }, []);

  const unregisterExecutor = useCallback((tabId: string) => {
    setCommandExecutors((prev) => {
      const next = new Map(prev);
      next.delete(tabId);
      return next;
    });
  }, []);

  // Asynchronously retrieve large custom wallpaper from IndexedDB if needed
  useEffect(() => {
    if (
      settings.backgroundImage === 'custom' &&
      (!settings.backgroundCustomUrl || settings.backgroundCustomUrl === 'indexeddb://custom_wallpaper')
    ) {
      getCustomWallpaperFromDb().then((customUrl) => {
        if (customUrl) {
          setSettings((prev) => ({
            ...prev,
            backgroundCustomUrl: customUrl,
          }));
        }
      });
    }
  }, [settings.backgroundImage]);

  // Save to localStorage safely (guarded against QuotaExceededError)
  useEffect(() => {
    safeLocalStorageSet('myterminal_connections', JSON.stringify(connections));
  }, [connections]);

  useEffect(() => {
    safeLocalStorageSet('myterminal_hosts', JSON.stringify(sshHosts));
  }, [sshHosts]);

  useEffect(() => {
    safeLocalStorageSet('myterminal_keys', JSON.stringify(sshKeys));
  }, [sshKeys]);

  useEffect(() => {
    safeLocalStorageSet('myterminal_snippets', JSON.stringify(snippets));
  }, [snippets]);

  useEffect(() => {
    safeLocalStorageSet('myterminal_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    // If a custom wallpaper data URL is present, persist it to IndexedDB
    if (
      settings.backgroundImage === 'custom' &&
      settings.backgroundCustomUrl &&
      settings.backgroundCustomUrl.startsWith('data:')
    ) {
      saveCustomWallpaperToDb(settings.backgroundCustomUrl).catch((err) => {
        console.warn('Failed to save wallpaper to IndexedDB:', err);
      });
    }

    // Never serialize giant base64 image strings into browser localStorage to prevent QuotaExceededError
    const settingsForStorage = {
      ...settings,
      backgroundCustomUrl: settings.backgroundCustomUrl?.startsWith('data:')
        ? 'indexeddb://custom_wallpaper'
        : (settings.backgroundCustomUrl || ''),
    };

    const serialized = JSON.stringify(settingsForStorage);
    safeLocalStorageSet('pookie_settings', serialized);
    safeLocalStorageSet('myterminal_settings', serialized);
  }, [settings]);

  useEffect(() => {
    safeLocalStorageSet('myterminal_sftp_windows', JSON.stringify(sftpWindows));
  }, [sftpWindows]);

  useEffect(() => {
    if (activeSftpWindowId) {
      safeLocalStorageSet('myterminal_sftp_active_window', activeSftpWindowId);
    } else {
      try {
        localStorage.removeItem('myterminal_sftp_active_window');
      } catch {}
    }
  }, [activeSftpWindowId]);

  useEffect(() => {
    safeLocalStorageSet('myterminal_sftp_side_panel', String(showSftpSidePanel));
  }, [showSftpSidePanel]);

  useEffect(() => {
    safeLocalStorageSet('myterminal_sftp_side_panel_width', String(sftpSidePanelWidth));
  }, [sftpSidePanelWidth]);


  const openSftpWindow = useCallback((host: SSHHost, initialPath: string = '/') => {
    const existing = sftpWindows.find((w) => w.host.id === host.id);
    if (existing) {
      setActiveSftpWindowId(existing.id);
      return existing.id;
    }
    const newWin = createSFTPWindow(host, initialPath);
    setSftpWindows((prev) => [...prev, newWin]);
    setActiveSftpWindowId(newWin.id);
    return newWin.id;
  }, [sftpWindows]);

  const closeSftpWindow = useCallback((windowId: string) => {
    setSftpWindows((prev) => {
      const next = prev.filter((w) => w.id !== windowId);
      if (activeSftpWindowId === windowId) {
        if (next.length > 0) {
          setActiveSftpWindowId(next[next.length - 1].id);
        } else {
          setActiveSftpWindowId(null);
        }
      }
      return next;
    });
  }, [activeSftpWindowId]);

  const updateSftpWindow = useCallback((windowId: string, updates: Partial<SFTPWindow>) => {
    setSftpWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, ...updates } : w))
    );
  }, []);

  const toggleSftpSidePanel = useCallback(() => {
    setShowSftpSidePanel((prev) => !prev);
  }, []);

  const recordCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const withoutDup = prev.filter((item) => item.command !== trimmed);
      return [
        {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          command: trimmed,
          timestamp: Date.now(),
        },
        ...withoutDup.slice(0, 199),
      ];
    });
  }, []);

  const deleteHistoryItem = useCallback((id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('myterminal_history');
  }, []);

  const loadShellHistory = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const entries = await invoke<{ id: string; command: string; timestamp: number }[]>('get_shell_history', { limit: 150 });
      if (Array.isArray(entries) && entries.length > 0) {
        setHistory((prev) => {
          const seen = new Set(prev.map((p) => p.command));
          const newEntries = entries.filter((e) => !seen.has(e.command));
          return [...prev, ...newEntries].slice(0, 200);
        });
      }
    } catch (err) {
      console.warn('Could not load native shell history:', err);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('myterminal_history');
    const isPlaceholderOrEmpty =
      !saved ||
      saved === JSON.stringify(INITIAL_HISTORY) ||
      (history.length <= 3 && history.every((h) => h.id.startsWith('hist-')));
    if (isPlaceholderOrEmpty) {
      loadShellHistory();
    }
  }, [loadShellHistory]);

  const createTab = useCallback((title: string, connectionId?: string) => {
    const newId = `tab-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newId,
      title: title || 'Terminal',
      connectionId: connectionId || 'conn-local',
      createdAt: Date.now(),
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setSelectedTool(null);
    return newId;
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const freshId = `tab-${Date.now()}`;
        setActiveTabId(freshId);
        return [
          {
            id: freshId,
            title: 'Local Shell',
            connectionId: 'conn-local',
            createdAt: Date.now(),
          },
        ];
      }
      if (activeTabId === id) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeTabId]);

  // Listen for multi-window detached and docked lifecycle events
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(WINDOW_BROADCAST_CHANNEL);
      bc.onmessage = (event) => {
        const msg = event.data as WindowBroadcastMessage;
        if (msg.type === 'TAB_DOCKED') {
          setTabs((prev) =>
            prev.map((t) => (t.id === msg.tabId ? { ...t, isPoppedUp: false } : t))
          );
        } else if (msg.type === 'TAB_DETACHED') {
          setTabs((prev) =>
            prev.map((t) => (t.id === msg.tabId ? { ...t, isPoppedUp: true } : t))
          );
        }
      };
    } catch {}

    return () => {
      if (bc) bc.close();
    };
  }, []);

  const toggleTabPopUp = useCallback(async (id: string) => {
    const targetTab = tabs.find((t) => t.id === id);
    if (!targetTab) return;

    if (targetTab.isPoppedUp) {
      await focusDetachedWindow(id);
    } else {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isPoppedUp: true } : t))
      );
      await openDetachedTerminalWindow({
        tabId: targetTab.id,
        title: targetTab.title,
        connectionId: targetTab.connectionId,
      });
    }
  }, [tabs]);

  const dockTab = useCallback(async (id: string) => {
    await closeDetachedWindow(id);
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isPoppedUp: false } : t))
    );
  }, []);

  const openNewDetachedTab = useCallback(async (title = 'Local Shell', connectionId = 'conn-local') => {
    const freshId = `tab-${Date.now()}`;
    const newTab: TerminalTab = {
      id: freshId,
      title,
      connectionId,
      createdAt: Date.now(),
      isPoppedUp: true,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(freshId);
    await openDetachedTerminalWindow({
      tabId: freshId,
      title,
      connectionId,
    });
  }, []);

  const removeConnection = useCallback((id: string) => {
    setConnections((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length > 0 ? next : INITIAL_CONNECTIONS;
    });
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.connectionId !== id);
      if (remaining.length === 0) {
        const freshId = `tab-${Date.now()}`;
        setActiveTabId(freshId);
        return [
          {
            id: freshId,
            title: 'Local Shell',
            connectionId: 'conn-local',
            createdAt: Date.now(),
          },
        ];
      }
      return remaining;
    });
    setSelectedConnectionId((prev) => (prev === id ? 'conn-local' : prev));
  }, []);

  const openModelManagerInSettings = useCallback(() => {
    setSettingsTab('models');
    setShowSettings(true);
    setShowModelManager(false);
  }, []);

  const selectConnection = useCallback((conn: Connection) => {
    setSelectedConnectionId(conn.id);
    setSelectedTool(null);
    const existing = tabs.find((t) => t.connectionId === conn.id);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      createTab(conn.name, conn.id);
    }
  }, [tabs, createTab]);

  const connectToSSHHost = useCallback((host: SSHHost) => {
    const connId = `conn-ssh-${host.id}`;
    const authType: SSHAuthType =
      host.authMethod === 'fido2' || host.authMethod === 'passkey'
        ? 'fido2'
        : host.authMethod === 'password'
        ? 'password'
        : 'sshKey';

    const newConn = createConnection({
      id: connId,
      name: host.label,
      hostname: host.hostname,
      port: host.port,
      username: host.username,
      type: 'ssh',
      authType,
      sshKeyPath: host.keyPath || '',
      password: host.password || '',
      status: 'connected',
      sortOrder: connections.length,
    });

    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.id === connId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = newConn;
        return copy;
      }
      return [...prev, newConn];
    });

    createTab(host.label, connId);
  }, [connections.length, createTab]);

  const runCommandInTerminal = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    setSelectedTool(null);
    recordCommand(trimmed);
    const executor = commandExecutors.get(activeTabId);
    if (executor) {
      setTimeout(() => executor(trimmed), 30);
    } else {
      setTimeout(() => {
        const retry = commandExecutors.get(activeTabId);
        if (retry) {
          retry(trimmed);
        }
      }, 100);
    }
  }, [activeTabId, commandExecutors, recordCommand]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShowAIPalette((prev) => !prev);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowSnippetPalette((prev) => !prev);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 't') {
        e.preventDefault();
        createTab('Terminal');
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        closeTab(activeTabId);
      } else if (e.key === 'Escape') {
        setShowAIPalette(false);
        setShowSnippetPalette(false);
        setShowNewConnection(false);
        setShowSettings(false);
        setShowModelManager(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, closeTab, createTab]);

  return {
    selectedTool,
    setSelectedTool,
    selectedConnectionId,
    connections,
    setConnections,
    removeConnection,
    tabs,
    activeTabId,
    setActiveTabId,
    sshHosts,
    setSshHosts,
    sshKeys,
    setSshKeys,
    selectedSftpHost,
    setSelectedSftpHost,
    sftpWindows,
    setSftpWindows,
    activeSftpWindowId,
    setActiveSftpWindowId,
    showSftpSidePanel,
    setShowSftpSidePanel,
    sftpSidePanelWidth,
    setSftpSidePanelWidth,
    openSftpWindow,
    closeSftpWindow,
    updateSftpWindow,
    toggleSftpSidePanel,
    snippets,
    setSnippets,
    history,
    recordCommand,
    deleteHistoryItem,
    clearHistory,
    loadShellHistory,
    settings,
    setSettings,
    showNewConnection,
    setShowNewConnection,
    showSettings,
    setShowSettings,
    settingsTab,
    setSettingsTab,
    openModelManagerInSettings,
    showAIPalette,
    setShowAIPalette,
    showSnippetPalette,
    setShowSnippetPalette,
    showModelManager,
    setShowModelManager,
    createTab,
    closeTab,
    toggleTabPopUp,
    dockTab,
    openNewDetachedTab,
    focusDetachedWindow,
    selectConnection,
    connectToSSHHost,
    runCommandInTerminal,
    registerExecutor,
    unregisterExecutor,
  };
}

export type AppStateContext = ReturnType<typeof useAppState>;
