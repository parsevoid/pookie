import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TerminalView } from '../Terminal/TerminalView';
import { AICommandPaletteView } from '../AICommandPalette/AICommandPaletteView';
import {
  WINDOW_BROADCAST_CHANNEL,
  type WindowBroadcastMessage,
  isTauriEnvironment,
  openDetachedTerminalWindow,
} from '../../utils/windowManager';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type TerminalTab,
  INITIAL_CONNECTIONS,
  INITIAL_SNIPPETS,
} from '../../stores/appState';
import { applyThemeCssVariables } from '../../styles/theme';
import type { Connection } from '../../models/Connection';
import type { Snippet } from '../../models/Snippet';
import logoImg from '../../assets/logo.png';
import { ArrowDownToDot, Plus } from 'lucide-react';

interface StandaloneTerminalWindowProps {
  tabId?: string;
  title?: string;
  connectionId?: string;
}

export const StandaloneTerminalWindow: React.FC<StandaloneTerminalWindowProps> = ({
  tabId: propTabId,
  title: propTitle,
  connectionId: propConnectionId,
}) => {
  const searchParams = new URLSearchParams(window.location.search);
  const tabId = propTabId || searchParams.get('popupTabId') || `tab-pop-${Date.now()}`;
  const initialTitle = propTitle || searchParams.get('title') || 'Terminal';
  const connectionId = propConnectionId || searchParams.get('connectionId') || 'conn-local';

  // Load persisted settings
  const [settings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('pookie_settings') || localStorage.getItem('myterminal_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
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

  // Apply theme tokens immediately
  useEffect(() => {
    if (settings.customPalette) {
      applyThemeCssVariables(
        settings.customPalette,
        settings.backgroundOpacity,
        settings.sizePreset || 'standard'
      );
    }
  }, [settings.customPalette, settings.backgroundOpacity, settings.sizePreset]);

  // Load connections and snippets
  const [connections] = useState<Connection[]>(() => {
    const saved = localStorage.getItem('myterminal_connections');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return INITIAL_CONNECTIONS;
  });

  const [snippets] = useState<Snippet[]>(() => {
    const saved = localStorage.getItem('myterminal_snippets');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return INITIAL_SNIPPETS;
  });

  const [showAIPalette, setShowAIPalette] = useState(false);
  const commandExecutorRef = useRef<((cmd: string) => void) | null>(null);

  const registerExecutor = useCallback((_id: string, fn: (cmd: string) => void) => {
    commandExecutorRef.current = fn;
  }, []);

  const unregisterExecutor = useCallback((_id: string) => {
    commandExecutorRef.current = null;
  }, []);

  const runCommandInTerminal = useCallback((cmd: string) => {
    if (commandExecutorRef.current) {
      commandExecutorRef.current(cmd);
    }
  }, []);

  // Broadcast dock and close window
  const dockAndCloseWindow = useCallback(async () => {
    try {
      const bc = new BroadcastChannel(WINDOW_BROADCAST_CHANNEL);
      bc.postMessage({ type: 'TAB_DOCKED', tabId } as WindowBroadcastMessage);
      bc.close();
    } catch {}

    if (isTauriEnvironment()) {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        await getCurrentWebviewWindow().close();
        return;
      } catch {}
    }

    window.close();
  }, [tabId]);

  // Handle minimize
  const handleMinimize = useCallback(async () => {
    if (isTauriEnvironment()) {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        await getCurrentWebviewWindow().minimize();
      } catch {}
    }
  }, []);

  // Handle maximize
  const handleMaximize = useCallback(async () => {
    if (isTauriEnvironment()) {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        await getCurrentWebviewWindow().toggleMaximize();
      } catch {}
    }
  }, []);

  // Spawn another detached window
  const spawnAnotherWindow = useCallback(async () => {
    const freshId = `tab-${Date.now()}`;
    await openDetachedTerminalWindow({
      tabId: freshId,
      title: 'Local Shell',
      connectionId: 'conn-local',
    });
  }, []);

  // Ensure native OS window decorations are disabled so only our single custom header is shown
  useEffect(() => {
    if (isTauriEnvironment()) {
      import('@tauri-apps/api/webviewWindow')
        .then(({ getCurrentWebviewWindow }) => {
          getCurrentWebviewWindow().setDecorations(false).catch(() => {});
        })
        .catch(() => {});
    }
  }, []);

  // Window lifecycle and broadcast listeners
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        const bc = new BroadcastChannel(WINDOW_BROADCAST_CHANNEL);
        bc.postMessage({ type: 'TAB_DOCKED', tabId } as WindowBroadcastMessage);
        bc.close();
      } catch {}
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(WINDOW_BROADCAST_CHANNEL);
      bc.onmessage = (event) => {
        const msg = event.data as WindowBroadcastMessage;
        if (msg.tabId === tabId) {
          if (msg.type === 'CLOSE_DETACHED_WINDOW') {
            dockAndCloseWindow();
          } else if (msg.type === 'FOCUS_WINDOW') {
            window.focus();
          }
        }
      };
    } catch {}

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (bc) bc.close();
    };
  }, [tabId, dockAndCloseWindow]);

  // Keyboard shortcut Cmd+I for AI Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShowAIPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const conn = connections.find((c) => c.id === connectionId);
  const isSsh = Boolean(
    connectionId.startsWith('conn-ssh-') ||
    (conn && (conn.type === 'ssh' || (conn as any).protocol === 'ssh'))
  );
  const targetEnv = isSsh ? 'ssh' : 'local';

  const tab: TerminalTab = {
    id: tabId,
    title: initialTitle,
    connectionId,
    createdAt: Date.now(),
    isPoppedUp: false,
  };

  const bgColor = settings.customPalette?.background || '#090b10';
  const textColor = settings.customPalette?.text || '#f8fafc';
  const borderColor = settings.customPalette?.border || 'rgba(255, 255, 255, 0.08)';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: bgColor,
        color: textColor,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* ─── MAC OS STYLE TITLE BAR ─── */}
      {/* ─── ULTRA-MINIMALIST MAC OS TITLE BAR ─── */}
      <header
        data-tauri-drag-region
        style={{
          height: '36px',
          minHeight: '36px',
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          userSelect: 'none',
          zIndex: 10,
          cursor: 'grab',
        }}
      >
        {/* Left: Traffic Lights + Mascot Logo + Minimalist Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', pointerEvents: 'auto' }}>
          {/* Traffic Lights */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <button
              type="button"
              title="Close window (dock back to tabs)"
              onClick={dockAndCloseWindow}
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '50%',
                backgroundColor: '#ff5f56',
                cursor: 'pointer',
                border: '1px solid rgba(0, 0, 0, 0.25)',
                padding: 0,
                outline: 'none',
              }}
            />
            <button
              type="button"
              title="Minimize window"
              onClick={handleMinimize}
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '50%',
                backgroundColor: '#ffbd2e',
                cursor: 'pointer',
                border: '1px solid rgba(0, 0, 0, 0.25)',
                padding: 0,
                outline: 'none',
              }}
            />
            <button
              type="button"
              title="Maximize / Restore window"
              onClick={handleMaximize}
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '50%',
                backgroundColor: '#27c93f',
                cursor: 'pointer',
                border: '1px solid rgba(0, 0, 0, 0.25)',
                padding: 0,
                outline: 'none',
              }}
            />
          </div>

          {/* Logo & Minimalist Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <img
              src={logoImg}
              alt="Pookie"
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '4px',
                objectFit: 'contain',
              }}
            />
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 500,
                color: '#cbd5e1',
                fontFamily: 'var(--font-mono, monospace)',
                letterSpacing: '0.1px',
              }}
            >
              {initialTitle}
            </span>
          </div>

          {/* Minimalist Environment Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '1px 6px',
              borderRadius: '999px',
              fontSize: '10.5px',
              fontFamily: 'var(--font-mono, monospace)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${borderColor}`,
              color: '#64748b',
            }}
          >
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 5px #10b981',
              }}
            />
            <span>{isSsh ? (conn?.name || 'ssh') : 'zsh'}</span>
          </div>
        </div>

        {/* Right: Minimalist Window Actions (New Window, Dock to Tabs) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', pointerEvents: 'auto' }}>
          {/* New Pop-up Window Button */}
          <button
            type="button"
            title="Open another pop-up terminal window"
            onClick={spawnAnotherWindow}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '24px',
              padding: '0 8px',
              borderRadius: '5px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${borderColor}`,
              color: '#94a3b8',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <Plus size={12} />
            <span>New</span>
          </button>

          {/* Dock Back to Main Window */}
          <button
            type="button"
            title="Dock back to main tabs"
            onClick={dockAndCloseWindow}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '24px',
              padding: '0 8px',
              borderRadius: '5px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${borderColor}`,
              color: '#94a3b8',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <ArrowDownToDot size={12} />
            <span>Dock</span>
          </button>
        </div>
      </header>

      {/* ─── FULL SCREEN TERMINAL BODY ─── */}
      <main
        style={{
          flex: 1,
          width: '100%',
          height: 'calc(100vh - 36px)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TerminalView
          tab={tab}
          isActive={true}
          settings={settings}
          registerExecutor={registerExecutor}
          unregisterExecutor={unregisterExecutor}
          snippets={snippets}
          connections={connections}
          isToolOpen={false}
          onTogglePopUp={dockAndCloseWindow}
        />
      </main>

      {/* AI Command Palette Modal (Cmd+I) */}
      <AICommandPaletteView
        isOpen={showAIPalette}
        onClose={() => setShowAIPalette(false)}
        onRunCommand={runCommandInTerminal}
        snippets={snippets}
        settings={settings}
        targetEnv={targetEnv}
      />
    </div>
  );
};
