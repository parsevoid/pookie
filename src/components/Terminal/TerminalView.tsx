import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Sparkles, Brain, FileCode2, Loader2, ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react';
import { getTerminalTheme, TerminalTheme, ColorPalette } from '../../styles/theme';
import { generateWithRouting, generateWithModelAsync, generateReasoningAsync, getModelDisplayName } from '../../engine/KaliTerminusEngine';
import type { TerminalTab, AppSettings } from '../../stores/appState';
import type { AICommandSuggestion } from '../../models/AISuggestion';
import type { Snippet } from '../../models/Snippet';
import type { Connection } from '../../models/Connection';

interface TerminalViewProps {
  tab: TerminalTab;
  isActive?: boolean;
  settings: AppSettings;
  registerExecutor: (tabId: string, fn: (cmd: string) => void) => void;
  unregisterExecutor: (tabId: string) => void;
  snippets?: Snippet[];
  connections?: Connection[];
  recordCommand?: (cmd: string) => void;
  isToolOpen?: boolean;
  onTogglePopUp?: (tabId: string) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  tab,
  isActive = true,
  settings,
  registerExecutor,
  unregisterExecutor,
  snippets = [],
  connections = [],
  recordCommand,
  isToolOpen = false,
  onTogglePopUp,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [inlineSuggestion, setInlineSuggestionState] = useState<AICommandSuggestion | null>(null);
  const inlineSuggestionRef = useRef<AICommandSuggestion | null>(null);

  const setInlineSuggestion = useCallback((sug: AICommandSuggestion | null) => {
    inlineSuggestionRef.current = sug;
    setInlineSuggestionState(sug);
  }, []);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const currentBufferRef = useRef<string>('');
  const sendCommandRef = useRef<((cmd: string) => void) | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationIdRef = useRef<number>(0);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const isTauriRef = useRef<boolean>(false);
  const startSessionRef = useRef<(() => Promise<void>) | null>(null);
  const [hostKeyPrompt, setHostKeyPrompt] = useState<{
    hostname: string;
    port: number;
    message: string;
    rawKeyLine: string;
  } | null>(null);

  const handleTrustHostKey = async () => {
    if (!hostKeyPrompt) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ssh_trust_host_key', { rawKeyLine: hostKeyPrompt.rawKeyLine });
      setHostKeyPrompt(null);
      if (termRef.current) {
        termRef.current.writeln('\x1b[38;2;34;197;94m✔ Host key verified & saved to ~/.ssh/known_hosts. Reconnecting...\x1b[0m\r\n');
      }
      startSessionRef.current?.();
    } catch (err) {
      if (termRef.current) {
        termRef.current.writeln(`\x1b[1;38;2;239;68;68m✖ Failed to save host key: ${err}\x1b[0m\r\n`);
      }
      setHostKeyPrompt(null);
    }
  };

  // Stable refs so settings/snippets updates never restart the terminal PTY session
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const snippetsRef = useRef(snippets);
  snippetsRef.current = snippets;
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const registerExecutorRef = useRef(registerExecutor);
  registerExecutorRef.current = registerExecutor;
  const unregisterExecutorRef = useRef(unregisterExecutor);
  unregisterExecutorRef.current = unregisterExecutor;
  const recordCommandRef = useRef(recordCommand);
  recordCommandRef.current = recordCommand;

  const getTargetEnv = (): string => {
    const isSshSession = Boolean(
      tab.connectionId && (
        tab.connectionId.startsWith('conn-ssh-') ||
        connectionsRef.current?.some((c) => c.id === tab.connectionId && (c.type === 'ssh' || (c as any).protocol === 'ssh'))
      )
    );
    return isSshSession ? 'ssh' : 'local';
  };

  // Fit & focus terminal whenever it becomes active tab or when sidebar tool closes
  useEffect(() => {
    if (isActive && !isToolOpen && fitAddonRef.current && termRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          termRef.current?.focus();
        } catch {}
      }, 50);
    }
  }, [isActive, isToolOpen]);

  // Re-fit terminal when switching tabs or window resizing
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        termRef.current?.focus();
      } catch {}
    }, 60);
    return () => clearTimeout(timer);
  }, [isActive]);

  // Live update terminal font/cursor/theme without restarting the shell process
  useEffect(() => {
    if (!termRef.current) return;
    try {
      termRef.current.options.fontSize = settings.fontSize;
      termRef.current.options.cursorBlink = settings.cursorBlink;
      termRef.current.options.cursorStyle = settings.cursorStyle;
      termRef.current.options.fontFamily = `'${settings.fontFamily}', 'JetBrains Mono', 'SF Mono', Menlo, Monaco, monospace`;
      const hasWallpaper = Boolean(settings.backgroundImage && settings.backgroundImage !== 'none');
      termRef.current.options.theme = getTerminalTheme(
        settings.customPalette,
        settings.backgroundOpacity,
        hasWallpaper
      );
      fitAddonRef.current?.fit();
    } catch {}
  }, [
    settings.fontSize,
    settings.cursorBlink,
    settings.cursorStyle,
    settings.fontFamily,
    settings.customPalette,
    settings.backgroundOpacity,
    settings.backgroundImage,
  ]);

  // Directly replaces the current line buffer in PTY/shell with the generated clean command
  const replacePromptWithCommand = useCallback((cmd: string) => {
    let clean = cmd.trim();
    // Strip any markdown code fences (```bash or ```)
    clean = clean.replace(/^```[a-zA-Z0-9_-]*/gm, '').replace(/```$/gm, '').trim();
    // Strip surrounding quotes or backticks that would put shell in continuation mode
    if (
      (clean.startsWith('`') && clean.endsWith('`')) ||
      (clean.startsWith('"') && clean.endsWith('"')) ||
      (clean.startsWith("'") && clean.endsWith("'"))
    ) {
      if (clean.length >= 2) {
        clean = clean.slice(1, -1).trim();
      }
    }
    // Clean any multi-line content into a single command chained with &&
    clean = clean
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'))
      .join(' && ');
    // Remove trailing backslashes that cause shell continuation lines
    clean = clean.replace(/\\+$/, '').trim();

    if (!clean) return;

    recordCommandRef.current?.(clean);

    if (isTauriRef.current) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('write_pty_data', { id: tab.id, data: '\x15' + clean }))
        .catch((err) => console.error('write_pty_data error:', err));
    } else if (termRef.current) {
      termRef.current.write(`\r\x1b[K$ ${clean}`);
    }
    currentBufferRef.current = clean;
    setInlineSuggestion(null);
    setIsModelLoading(false);
  }, [tab.id]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize xterm.js instance
    const hasWallpaper = Boolean(settings.backgroundImage && settings.backgroundImage !== 'none');
    const term = new Terminal({
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      fontSize: settings.fontSize,
      fontFamily: `'${settings.fontFamily}', 'JetBrains Mono', 'SF Mono', Menlo, Monaco, monospace`,
      lineHeight: 1.25,
      theme: getTerminalTheme(settings.customPalette, settings.backgroundOpacity, hasWallpaper),
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Intercept Tab and Right Arrow before browser focus navigation or shell processing
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type === 'keydown') {
        // Tab key or Right Arrow key to accept inline AI suggestion
        if (
          event.key === 'Tab' ||
          (event.key === 'ArrowRight' && term.buffer.active.cursorX >= currentBufferRef.current.length)
        ) {
          const activeSug = inlineSuggestionRef.current;
          if (activeSug && activeSug.command && activeSug.command.trim()) {
            event.preventDefault();
            event.stopPropagation();
            replacePromptWithCommand(activeSug.command);
            return false;
          }
        }

        // Escape key to dismiss suggestion
        if (event.key === 'Escape') {
          if (inlineSuggestionRef.current) {
            event.preventDefault();
            event.stopPropagation();
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            setIsModelLoading(false);
            setInlineSuggestion(null);
            return false;
          }
        }
      }
      return true;
    });

    isTauriRef.current = false;
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    // Helper to start inline reasoning session replacing the prompt
    const startInlineReasoning = (queryStr: string) => {
      const q = queryStr.trim();
      if (!q) return;
      const modelId = settingsRef.current?.reasoningModel || 'ternary-bonsai-27b';
      const targetEnv = getTargetEnv();

      setIsModelLoading(true);
      generateReasoningAsync(q, modelId, targetEnv)
        .then((suggestion) => {
          const cmd = suggestion?.command?.trim();
          if (cmd) {
            replacePromptWithCommand(cmd);
          }
        })
        .catch((err) => {
          console.error('Inline reasoning failed:', err);
        })
        .finally(() => {
          setIsModelLoading(false);
        });
    };

    // Helper to send command to this terminal session
    const sendCommand = (cmd: string) => {
      const trimmed = cmd.trim();
      if (trimmed.startsWith('@')) {
        startInlineReasoning(trimmed.slice(1));
        return;
      }

      recordCommandRef.current?.(trimmed);

      if (isTauriRef.current) {
        import('@tauri-apps/api/core')
          .then(({ invoke }) => {
            const normalized = cmd.replace(/\r?\n/g, '\r') + '\r';
            invoke('write_pty_data', {
              id: tab.id,
              data: '\x15' + normalized,
            });
          })
          .catch((err) => console.error('write_pty_data error:', err));
      } else {
        term.writeln('');
        term.write(`\x1b[32m$\x1b[0m ${cmd}\r\n`);
        term.writeln(`[Dispatched: ${cmd}]`);
      }
    };

    sendCommandRef.current = sendCommand;
    registerExecutorRef.current(tab.id, sendCommand);

    const handleResize = () => {
      try {
        fitAddon.fit();
        const cols = Math.max(20, Math.floor(term.cols || 80));
        const rows = Math.max(10, Math.floor(term.rows || 24));
        if (isTauriRef.current) {
          import('@tauri-apps/api/core')
            .then(({ invoke }) => {
              invoke('resize_pty', { id: tab.id, cols, rows }).catch(() => {});
            })
            .catch(() => {});
        }
      } catch {}
    };

    // Connect to Tauri native PTY
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');

        const cols = Math.max(20, Math.floor(term.cols || 80));
        const rows = Math.max(10, Math.floor(term.rows || 24));

        // Robust connection resolver: check props, localStorage connections, and localStorage hosts
        const findTabConnection = (): Connection | null => {
          let c = connectionsRef.current?.find((x) => x.id === tab.connectionId);
          if (c) return c;

          try {
            const raw = localStorage.getItem('myterminal_connections');
            if (raw) {
              const list: Connection[] = JSON.parse(raw);
              c = list.find((x) => x.id === tab.connectionId);
              if (c) return c;
            }
          } catch {}

          if (tab.connectionId.startsWith('conn-ssh-')) {
            const hostId = tab.connectionId.replace('conn-ssh-', '');
            try {
              const rawH = localStorage.getItem('myterminal_hosts');
              if (rawH) {
                const hosts = JSON.parse(rawH);
                const h = Array.isArray(hosts) ? hosts.find((x: any) => x.id === hostId) : null;
                if (h) {
                  return {
                    id: tab.connectionId,
                    name: h.label,
                    hostname: h.hostname,
                    port: h.port || 22,
                    username: h.username || '',
                    password: h.password || '',
                    type: 'ssh',
                    status: 'connected',
                    label: h.label,
                    parentGroup: '',
                    tags: h.tags || [],
                    backspaceMode: 'default',
                    authType: h.authMethod === 'fido2' || h.authMethod === 'passkey' ? 'fido2' : h.authMethod === 'password' ? 'password' : 'sshKey',
                    sshKeyPath: h.keyPath || '',
                    certificatePath: '',
                    createdAt: h.createdAt || new Date().toISOString(),
                    lastConnectedAt: null,
                    sortOrder: 0,
                  };
                }
              }
            } catch {}
          }

          try {
            const raw = localStorage.getItem('myterminal_connections');
            if (raw) {
              const list: Connection[] = JSON.parse(raw);
              c = list.find((x) => x.id === tab.connectionId || x.name === tab.title || x.label === tab.title);
              if (c) return c;
            }
          } catch {}

          return null;
        };

        const conn = findTabConnection();
        let isSessionExited = false;

        const startSession = async () => {
          startSessionRef.current = startSession;
          try {
            await invoke('close_pty_session', { id: tab.id });
          } catch {}

          let ptyCommand: string | null = null;
          let ptyArgs: string[] | null = null;
          let effectivePassword = conn?.password || null;

          if (conn && conn.type === 'ssh' && conn.hostname) {
            // High-Tech Pre-Flight Diagnostics for SSH
            term.writeln('\x1b[38;2;99;102;241m╭────────────────────────────────────────────────────────────────────────────╮\x1b[0m');
            term.writeln(`\x1b[38;2;99;102;241m│\x1b[0m  \x1b[1;38;2;248;250;252m⚡ POOKIE SSH ENGINE — PRE-FLIGHT DIAGNOSTICS\x1b[0m                              \x1b[38;2;99;102;241m│\x1b[0m`);
            term.writeln(`\x1b[38;2;99;102;241m│\x1b[0m  Target:  \x1b[38;2;56;189;248m${conn.username ? `${conn.username}@` : ''}${conn.hostname}:${conn.port || 22}\x1b[0m`);
            term.writeln(`\x1b[38;2;99;102;241m│\x1b[0m  Auth:    \x1b[38;2;168;85;247m${conn.authType === 'password' ? 'Password' : conn.authType === 'fido2' ? 'FIDO2 Passkey' : 'SSH Key'}\x1b[0m`);
            term.writeln('\x1b[38;2;99;102;241m╰────────────────────────────────────────────────────────────────────────────╯\x1b[0m');
            term.write('\x1b[38;2;148;163;184m[1/2] Analyzing server reachability and authenticating credentials...\x1b[0m\r');

            if (!effectivePassword && conn.authType === 'password') {
              try {
                const vaultPass = await invoke<string | null>('get_secure_credential', {
                  service: 'myterminal_ssh',
                  account: `${conn.username || ''}@${conn.hostname}`,
                });
                if (vaultPass) {
                  effectivePassword = vaultPass;
                }
              } catch {}
            }

            let diagResult: any = null;
            try {
              diagResult = await invoke('verify_ssh_connection', {
                config: {
                  hostname: conn.hostname,
                  port: conn.port || 22,
                  username: conn.username || '',
                  auth_type: conn.authType || 'sshKey',
                  key_path: conn.sshKeyPath || null,
                  password: effectivePassword,
                },
              });
            } catch (err) {
              diagResult = {
                success: false,
                message: String(err),
              };
            }

            if (!diagResult || !diagResult.success) {
              if (diagResult?.status === 'host_key_changed') {
                term.write('\x1b[2K\r');
                term.writeln('\x1b[1;38;2;239;68;68m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
                term.writeln('\x1b[1;38;2;239;68;68m║ ⚠️  CRITICAL SECURITY ALERT: REMOTE HOST KEY HAS CHANGED!                   ║\x1b[0m');
                term.writeln('\x1b[1;38;2;239;68;68m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
                term.writeln(`\x1b[38;2;248;250;252m${diagResult.message}\x1b[0m\r\n`);
                term.writeln('\x1b[38;2;251;191;36m• Potential Man-in-the-Middle (MITM) attack or server was re-provisioned.\x1b[0m');
                term.writeln('\x1b[38;2;251;191;36m• Connection was terminated to protect your credentials.\x1b[0m\r\n');
                return;
              }
              if (diagResult?.status === 'untrusted_host_key') {
                term.write('\x1b[2K\r');
                term.writeln('\x1b[1;38;2;234;179;8m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
                term.writeln('\x1b[1;38;2;234;179;8m║ 🔒 HOST KEY VERIFICATION REQUIRED                                          ║\x1b[0m');
                term.writeln('\x1b[1;38;2;234;179;8m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
                term.writeln(`\x1b[38;2;248;250;252m${diagResult.message}\x1b[0m\r\n`);
                term.writeln('\x1b[38;2;148;163;184mPlease review and trust the fingerprint in the dialog overlay to proceed.\x1b[0m\r\n');
                setHostKeyPrompt({
                  hostname: conn.hostname,
                  port: conn.port || 22,
                  message: diagResult.message,
                  rawKeyLine: diagResult.os_info || '',
                });
                return;
              }
              // If failure was solely because no password was configured or auth was not pre-verified, launch interactive console
              if (diagResult?.status === 'missing_password' && conn.authType === 'password') {
                term.write(`\x1b[2K\r\x1b[38;2;34;197;94m✔ Host verified (${diagResult.latency_ms}ms). Starting session — enter password when prompted:\x1b[0m\r\n`);
              } else {
                term.write('\x1b[2K\r');
                term.writeln(`\x1b[38;2;245;158;11m⚡ Pre-Flight Note: ${diagResult?.message || 'Authentication not pre-verified'}. Starting interactive console...\x1b[0m\r\n`);
              }
            } else {
              term.write(`\x1b[2K\r\x1b[38;2;34;197;94m✔ [2/2] Authenticated in ${diagResult.latency_ms}ms${diagResult.os_info ? ` (${diagResult.os_info})` : ''}. Starting clean session...\x1b[0m\r\n`);
            }

            ptyCommand = 'ssh';
            const args: string[] = [
              '-o', 'LogLevel=ERROR',
              '-o', 'StrictHostKeyChecking=accept-new',
            ];
            if (conn.authType === 'password') {
              args.push('-o', 'PreferredAuthentications=keyboard-interactive,password');
              args.push('-o', 'PubkeyAuthentication=no');
            }
            if (conn.port && conn.port !== 22) {
              args.push('-p', String(conn.port));
            }
            if ((conn.authType === 'sshKey' || conn.authType === 'fido2' || conn.authType === 'passkey') && conn.sshKeyPath) {
              args.push('-i', conn.sshKeyPath);
            }
            if (conn.authType === 'certificate' && conn.certificatePath) {
              args.push('-i', conn.certificatePath);
            }
            const target = conn.username ? `${conn.username}@${conn.hostname}` : conn.hostname;
            args.push(target);
            ptyArgs = args;
          } else if (conn && conn.type === 'telnet' && conn.hostname) {
            // High-Tech Pre-Flight for Telnet
            term.writeln('\x1b[38;2;99;102;241m╭────────────────────────────────────────────────────────────────────────────╮\x1b[0m');
            term.writeln(`\x1b[38;2;99;102;241m│\x1b[0m  \x1b[1;38;2;248;250;252m⚡ POOKIE TELNET CHANNEL — PRE-FLIGHT\x1b[0m                                     \x1b[38;2;99;102;241m│\x1b[0m`);
            term.writeln(`\x1b[38;2;99;102;241m│\x1b[0m  Host:  \x1b[38;2;56;189;248m${conn.hostname}:${conn.port || 23}\x1b[0m`);
            term.writeln('\x1b[38;2;99;102;241m╰────────────────────────────────────────────────────────────────────────────╯\x1b[0m');
            term.write('\x1b[38;2;148;163;184mConnecting to Telnet port...\x1b[0m\r');

            let diag: any = null;
            try {
              diag = await invoke('verify_channel_connection', {
                config: {
                  protocol: 'telnet',
                  hostname: conn.hostname,
                  port: conn.port || 23,
                  username: conn.username || null,
                  password: conn.password || null,
                },
              });
            } catch (err) {
              diag = { success: false, message: String(err) };
            }

            if (!diag || !diag.success) {
              term.write('\x1b[2K\r');
              term.writeln(`\x1b[1;38;2;239;68;68m✖ Telnet Error: ${diag?.message || 'Connection failed'}\x1b[0m\r\n`);
              return;
            }

            term.write(`\x1b[2K\r\x1b[38;2;34;197;94m✔ Telnet host verified (${diag.latency_ms}ms). Starting interactive console...\x1b[0m\r\n`);
            ptyCommand = 'telnet';
            ptyArgs = [conn.hostname, String(conn.port || 23)];
          } else if (conn && conn.type === 'ftp' && conn.hostname) {
            // High-Tech Pre-Flight for FTP
            term.writeln('\x1b[38;2;99;102;241m╭────────────────────────────────────────────────────────────────────────────╮\x1b[0m');
            term.writeln(`\x1b[38;2;99;102;241m│\x1b[0m  \x1b[1;38;2;248;250;252m⚡ POOKIE FTP CHANNEL — PRE-FLIGHT\x1b[0m                                        \x1b[38;2;99;102;241m│\x1b[0m`);
            term.writeln(`\x1b[38;2;99;102;241m│\x1b[0m  Target:  \x1b[38;2;56;189;248m${conn.username ? `${conn.username}@` : ''}${conn.hostname}:${conn.port || 21}\x1b[0m`);
            term.writeln('\x1b[38;2;99;102;241m╰────────────────────────────────────────────────────────────────────────────╯\x1b[0m');
            term.write('\x1b[38;2;148;163;184mConnecting to FTP service...\x1b[0m\r');

            let diag: any = null;
            try {
              diag = await invoke('verify_channel_connection', {
                config: {
                  protocol: 'ftp',
                  hostname: conn.hostname,
                  port: conn.port || 21,
                  username: conn.username || null,
                  password: conn.password || null,
                },
              });
            } catch (err) {
              diag = { success: false, message: String(err) };
            }

            if (!diag || !diag.success) {
              term.write('\x1b[2K\r');
              term.writeln(`\x1b[1;38;2;239;68;68m✖ FTP Error: ${diag?.message || 'Connection failed'}\x1b[0m\r\n`);
              return;
            }

            term.write(`\x1b[2K\r\x1b[38;2;34;197;94m✔ FTP host verified (${diag.latency_ms}ms). Starting interactive FTP console...\x1b[0m\r\n`);
            ptyCommand = 'ftp';
            ptyArgs = ['-p', conn.hostname, String(conn.port || 21)];
          } else if (conn && conn.type === 'raw_tcp' && conn.hostname) {
            ptyCommand = 'nc';
            ptyArgs = ['-v', conn.hostname, String(conn.port || 8080)];
          } else if (conn && conn.type === 'serial' && conn.hostname) {
            ptyCommand = 'screen';
            ptyArgs = [conn.hostname, String(conn.port || 115200)];
          }

          await invoke('create_pty_session', {
            id: tab.id,
            command: ptyCommand,
            args: ptyArgs,
            cols,
            rows,
            password: effectivePassword || null,
          });

          isTauriRef.current = true;
          handleResize();
          setTimeout(handleResize, 100);
          setTimeout(handleResize, 300);
          setTimeout(handleResize, 600);
        };

        await startSession();

        // Listen for output from PTY
        let initialCleanDone = false;
        const isSSH = !!(conn && conn.type === 'ssh' && conn.hostname);

        // Fallback timer: ensure output is never permanently suppressed if prompt regex misses
        setTimeout(() => {
          initialCleanDone = true;
        }, 4000);

        unlistenData = await listen<string>(`pty-data-${tab.id}`, (event) => {
          const payload = event.payload;

          // For SSH sessions: Clean out initial noisy login spam
          // As soon as the shell prompt arrives, render a sleek status bar!
          if (isSSH && !initialCleanDone) {
            if (/(\]|\$|#|>)\s*$/m.test(payload) || /\[.*@.*\]/m.test(payload)) {
              initialCleanDone = true;
              const lines = payload.split(/\r?\n/).filter(Boolean);
              const promptLine = lines[lines.length - 1] || payload;

              // Clear screen and draw high-end status line
              term.write('\x1b[2J\x1b[H');
              term.writeln(`\x1b[38;2;34;197;94m● Connected:\x1b[0m \x1b[1;38;2;248;250;252m${conn.username}@${conn.hostname}:${conn.port || 22}\x1b[0m  \x1b[38;2;148;163;184m│  SSH Session Active\x1b[0m\r\n`);
              term.write(promptLine);
              return;
            }
          }

          term.write(payload);
        });

        unlistenExit = await listen(`pty-exit-${tab.id}`, () => {
          if (isSessionExited) return;
          isSessionExited = true;

          const isRemote = conn && conn.type !== 'local';
          const typeLabel = isRemote ? (conn?.type?.toUpperCase() || 'REMOTE') : 'LOCAL';

          // Elegant, professional session close notification with 1-key restart
          term.writeln('\r\n\x1b[90m─────────────────────────────────────────────────────────────\x1b[0m');
          term.writeln(`\x1b[38;2;148;163;184m● ${typeLabel} session ended.\x1b[0m  \x1b[38;2;99;102;241m[Press Enter or R to restart • ⌘W to close tab]\x1b[0m\r\n`);
        });

        // Send user typing to PTY and track line buffer for real-time suggestion
        term.onData((data) => {
          // If session has exited, hitting Enter or R restarts it seamlessly
          if (isSessionExited) {
            if (data === '\r' || data === '\n' || data.toLowerCase() === 'r') {
              isSessionExited = false;
              term.write('\x1b[2J\x1b[H\x1b[38;2;34;197;94m⚡ Starting session...\x1b[0m\r\n');
              currentBufferRef.current = '';
              setInlineSuggestion(null);
              startSession();
            }
            return;
          }
          // A. If Enter is pressed, check if user was typing an @ reasoning query or # snippet
          if (data === '\r' || data === '\n') {
            const trimmed = currentBufferRef.current.trim();
            if (trimmed.startsWith('@')) {
              // Intercept directly typed reasoning (@) — replace prompt with generated command
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              const query = trimmed.slice(1).trim();
              if (!query) {
                currentBufferRef.current = '';
                return;
              }

              // If an inline suggestion is already loaded, replace immediately
              const activeSug = inlineSuggestionRef.current;
              if (activeSug && activeSug.command && activeSug.command.trim()) {
                replacePromptWithCommand(activeSug.command);
                return;
              }

              // Otherwise start loading inline and replace as soon as received
              setIsModelLoading(true);
              const genId = ++generationIdRef.current;
              const modelId = settingsRef.current?.reasoningModel || 'ternary-bonsai-27b';
              const targetEnv = getTargetEnv();
              generateReasoningAsync(query, modelId, targetEnv)
                .then((match) => {
                  if (generationIdRef.current !== genId) return;
                  const cmd = match?.command?.trim();
                  if (cmd) {
                    replacePromptWithCommand(cmd);
                  }
                })
                .catch((err) => {
                  console.error('Inline reasoning failed:', err);
                })
                .finally(() => {
                  if (generationIdRef.current === genId) {
                    setIsModelLoading(false);
                  }
                });
              return;
            }

            if (trimmed.startsWith('#')) {
              // Intercept snippet (#) — instant local search
              const suggestion = generateWithRouting(trimmed, snippetsRef.current, settingsRef.current?.aiModel, settingsRef.current?.aiModel);
              if (suggestion && suggestion.command) {
                replacePromptWithCommand(suggestion.command + '\r');
                return;
              }
            }

            // Normal command enter — records command and sends carriage return to PTY
            let executedCmd = trimmed;
            if (!executedCmd && termRef.current) {
              try {
                const activeBuf = termRef.current.buffer.active;
                const lineObj = activeBuf.getLine(activeBuf.baseY + activeBuf.cursorY);
                if (lineObj) {
                  const rawText = lineObj.translateToString(true).trim();
                  // Extract command after shell prompt symbol (%, $, #, >, ❯, ➜, »)
                  const promptMatch = rawText.match(/(?:^.*[%$#>❯➜»]\s*)(.+)$/);
                  if (promptMatch && promptMatch[1]) {
                    executedCmd = promptMatch[1].trim();
                  }
                }
              } catch {}
            }

            if (executedCmd && !executedCmd.startsWith('@') && !executedCmd.startsWith('#')) {
              recordCommandRef.current?.(executedCmd);
            }

            invoke('write_pty_data', { id: tab.id, data: '\r' }).catch((err) =>
              console.error('write_pty_data error:', err)
            );
            currentBufferRef.current = '';
            setInlineSuggestion(null);
            return;
          }

          // Tab key or Right Arrow accepts active inline suggestion
          if ((data === '\t' || data === '\x1b[C') && inlineSuggestionRef.current) {
            replacePromptWithCommand(inlineSuggestionRef.current.command);
            return;
          }

          // Up / Down arrow keys for terminal command history navigation
          if (data === '\x1b[A' || data === '\x1b[B') {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            setIsModelLoading(false);
            setInlineSuggestion(null);
            currentBufferRef.current = '';
            invoke('write_pty_data', { id: tab.id, data }).catch((err) =>
              console.error('write_pty_data error:', err)
            );
            return;
          }

          // Escape key dismisses suggestion
          if (data === '\x1b') {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            setIsModelLoading(false);
            setInlineSuggestion(null);
          }

          // Ctrl+C or Ctrl+D interrupt
          if (data === '\x03' || data === '\x04') {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            setIsModelLoading(false);
            currentBufferRef.current = '';
            setInlineSuggestion(null);
            invoke('write_pty_data', { id: tab.id, data }).catch((err) =>
              console.error('write_pty_data error:', err)
            );
            return;
          }

          // Backspace keystroke
          if (data === '\x7f' || data === '\x08') {
            currentBufferRef.current = currentBufferRef.current.slice(0, -1);
            const buf = currentBufferRef.current.trim();
            if (buf.startsWith('@')) {
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              if (buf.length >= 3) {
                const genId = ++generationIdRef.current;
                setIsModelLoading(true);
                debounceTimerRef.current = setTimeout(() => {
                  const query = buf.slice(1).trim();
                  if (!query) {
                    setIsModelLoading(false);
                    setInlineSuggestion(null);
                    return;
                  }
                  const targetEnv = getTargetEnv();
                  generateReasoningAsync(query, settingsRef.current?.reasoningModel || 'ternary-bonsai-27b', targetEnv)
                    .then((match) => {
                      if (generationIdRef.current !== genId) return;
                      setIsModelLoading(false);
                      if (match && match.command && match.command.trim()) {
                        setInlineSuggestion(match);
                      } else {
                        setInlineSuggestion(null);
                      }
                    })
                    .catch(() => {
                      if (generationIdRef.current === genId) {
                        setIsModelLoading(false);
                        setInlineSuggestion(null);
                      }
                    });
                }, 400);
              } else {
                setIsModelLoading(false);
                setInlineSuggestion(null);
              }
            } else if (buf.length >= 2) {
              if (buf.startsWith('#')) {
                const match = generateWithRouting(buf, snippetsRef.current, settingsRef.current?.reasoningModel, settingsRef.current?.aiModel);
                if (match && match.command.trim() !== buf) {
                  setInlineSuggestion(match);
                } else {
                  setInlineSuggestion(null);
                }
              } else {
                // Debounced async model call
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                const genId = ++generationIdRef.current;
                const targetEnv = getTargetEnv();
                setIsModelLoading(true);
                debounceTimerRef.current = setTimeout(() => {
                  generateWithModelAsync(buf, snippetsRef.current, settingsRef.current?.reasoningModel || 'ternary-bonsai-27b', settingsRef.current?.aiModel || 'ternary-bonsai-1.7b', targetEnv)
                    .then((match) => {
                      if (generationIdRef.current !== genId) return;
                      setIsModelLoading(false);
                      if (match && match.command.trim() !== buf) {
                        setInlineSuggestion(match);
                      } else {
                        setInlineSuggestion(null);
                      }
                    })
                    .catch(() => {
                      if (generationIdRef.current === genId) {
                        setIsModelLoading(false);
                        setInlineSuggestion(null);
                      }
                    });
                }, 400);
              }
            } else {
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              setIsModelLoading(false);
              setInlineSuggestion(null);
            }
            invoke('write_pty_data', { id: tab.id, data }).catch((err) =>
              console.error('write_pty_data error:', err)
            );
            return;
          }

          // Forward printable keystroke to PTY
          invoke('write_pty_data', {
            id: tab.id,
            data,
          }).catch((err) => console.error('write_pty_data error:', err));

          // Buffer printable characters for real-time AI suggestions
          if (data.length === 1 && data.charCodeAt(0) >= 32) {
            currentBufferRef.current += data;
            const buf = currentBufferRef.current.trim();
            if (buf.startsWith('@')) {
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              if (buf.length >= 3) {
                const genId = ++generationIdRef.current;
                setIsModelLoading(true);
                debounceTimerRef.current = setTimeout(() => {
                  const query = buf.slice(1).trim();
                  if (!query) {
                    setIsModelLoading(false);
                    setInlineSuggestion(null);
                    return;
                  }
                  const targetEnv = getTargetEnv();
                  generateReasoningAsync(query, settingsRef.current?.reasoningModel || 'ternary-bonsai-27b', targetEnv)
                    .then((match) => {
                      if (generationIdRef.current !== genId) return;
                      setIsModelLoading(false);
                      if (match && match.command && match.command.trim()) {
                        setInlineSuggestion(match);
                      } else {
                        setInlineSuggestion(null);
                      }
                    })
                    .catch(() => {
                      if (generationIdRef.current === genId) {
                        setIsModelLoading(false);
                        setInlineSuggestion(null);
                      }
                    });
                }, 400);
              } else {
                setIsModelLoading(false);
                setInlineSuggestion(null);
              }
            } else if (buf.length >= 2) {
              // Snippet search is instant
              if (buf.startsWith('#')) {
                const match = generateWithRouting(buf, snippetsRef.current, settingsRef.current?.aiModel, settingsRef.current?.aiModel);
                if (match && match.command.trim() !== buf) {
                  setInlineSuggestion(match);
                } else {
                  setInlineSuggestion(null);
                }
              } else {
                // Debounced async model call for suggestions
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                const genId = ++generationIdRef.current;
                const targetEnv = getTargetEnv();
                setIsModelLoading(true);
                debounceTimerRef.current = setTimeout(() => {
                  generateWithModelAsync(buf, snippetsRef.current, settingsRef.current?.reasoningModel || 'ternary-bonsai-27b', settingsRef.current?.aiModel || 'ternary-bonsai-1.7b', targetEnv)
                    .then((match) => {
                      if (generationIdRef.current !== genId) return;
                      setIsModelLoading(false);
                      if (match && match.command.trim() !== buf) {
                        setInlineSuggestion(match);
                      } else {
                        setInlineSuggestion(null);
                      }
                    })
                    .catch(() => {
                      if (generationIdRef.current === genId) {
                        setIsModelLoading(false);
                        setInlineSuggestion(null);
                      }
                    });
                }, 400);
              }
            } else {
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              setIsModelLoading(false);
              setInlineSuggestion(null);
            }
          } else if (data.length > 1 && !data.startsWith('\x1b') && !/[\x00-\x1f]/.test(data)) {
            // Buffer multi-character pasted text
            currentBufferRef.current += data;
          }
        });

        // Track cursor movements for exact inline ghost text positioning
        term.onCursorMove(() => {
          setCursorPos({
            x: term.buffer.active.cursorX,
            y: term.buffer.active.cursorY,
          });
        });

        // Send resize events to PTY
        term.onResize(({ cols, rows }) => {
          const c = Math.max(20, Math.floor(cols));
          const r = Math.max(10, Math.floor(rows));
          invoke('resize_pty', {
            id: tab.id,
            cols: c,
            rows: r,
          }).catch((err) => console.error('resize_pty error:', err));
        });
      } catch (err) {
        console.error('Failed to initialize native PTY session:', err);
        term.writeln('\x1b[33m[Notice: Running in preview mode without native PTY]\x1b[0m');
        term.writeln(`\x1b[31mDetails: ${String(err)}\x1b[0m`);
      }
    })();

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      unregisterExecutorRef.current(tab.id);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();
      if (isTauriRef.current) {
        import('@tauri-apps/api/core')
          .then(({ invoke }) => {
            invoke('close_pty_session', { id: tab.id });
          })
          .catch(() => {});
      }
      term.dispose();
    };
  }, [tab.id]);

  // Exact layout metrics calculation for pixel-perfect ghost text alignment
  const getLayoutPosition = () => {
    const term = termRef.current as any;
    const dims = term?._core?._renderService?.dimensions?.css?.cell;
    const exactWidth = dims?.width && dims.width > 0 ? dims.width : 8.4;
    const exactHeight = dims?.height && dims.height > 0 ? dims.height : 18;

    // 1. Check if the terminal cursor DOM element is rendered and measurable
    if (containerRef.current) {
      const cursorEl = containerRef.current.querySelector('.xterm-cursor') as HTMLElement | null;
      if (cursorEl) {
        const cRect = containerRef.current.getBoundingClientRect();
        const curRect = cursorEl.getBoundingClientRect();
        if (curRect.width > 0 && curRect.height > 0) {
          return {
            top: curRect.top - cRect.top,
            left: curRect.left - cRect.left,
            cellHeight: curRect.height,
            cellWidth: curRect.width,
          };
        }
      }

      // 2. Measure offset from .xterm-screen if available
      const screenEl = containerRef.current.querySelector('.xterm-screen') as HTMLElement | null;
      if (screenEl) {
        const cRect = containerRef.current.getBoundingClientRect();
        const sRect = screenEl.getBoundingClientRect();
        return {
          top: sRect.top - cRect.top + cursorPos.y * exactHeight,
          left: sRect.left - cRect.left + cursorPos.x * exactWidth,
          cellHeight: exactHeight,
          cellWidth: exactWidth,
        };
      }
    }

    // 3. Fallback based on default padding
    return {
      top: 8 + cursorPos.y * exactHeight,
      left: 12 + cursorPos.x * exactWidth,
      cellHeight: exactHeight,
      cellWidth: exactWidth,
    };
  };

  const layout = getLayoutPosition();
  const lineTop = layout.top;
  const lineLeft = layout.left;
  const cellHeight = layout.cellHeight;

  const getGhostText = () => {
    if (!inlineSuggestion || inlineSuggestion.mode === 'reasoning') return '';
    const buf = currentBufferRef.current.trim();
    if (buf.startsWith('@') || buf.length < 2) return '';
    const cmd =
      inlineSuggestion.command
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => !l.startsWith('#') && !l.startsWith('//'))[0] ||
      inlineSuggestion.command.split('\n')[0].trim();
    if (cmd.toLowerCase().startsWith(buf.toLowerCase())) {
      const suffix = cmd.slice(buf.length);
      // Extra UI-level safeguard: reject conversational sentences as ghost text
      if (/^\s*(okay|sure|here|to|i need|the user|let's|note:|first|we |you )/i.test(suffix)) {
        return '';
      }
      return suffix;
    }
    return '';
  };
  const ghostText = getGhostText();
  const isTypingReasoning = currentBufferRef.current.trim().startsWith('@');

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: settings.customPalette?.background || TerminalTheme.background,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Detached Window Pop-Up Button */}
      {onTogglePopUp && (
        <button
          type="button"
          title="Pop up in separate desktop window"
          onClick={() => onTogglePopUp?.(tab.id)}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '26px',
            height: '26px',
            borderRadius: '5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: ColorPalette.textMuted,
            cursor: 'pointer',
            zIndex: 20,
            opacity: 0.5,
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
            e.currentTarget.style.color = 'var(--theme-primary, #38bdf8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.5';
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
            e.currentTarget.style.color = ColorPalette.textMuted;
          }}
        >
          <ExternalLink size={12} />
        </button>
      )}

      {/* Terminal Body */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          padding: '0px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
          <div
            ref={containerRef}
            style={{
              flex: 1,
              width: '100%',
              minHeight: 0,
            }}
          />

      {/* Ghost text completion right at cursor line with sub-pixel alignment */}
      {inlineSuggestion && ghostText && !isTypingReasoning && (
        <span
          style={{
            position: 'absolute',
            top: `${lineTop}px`,
            left: `${lineLeft}px`,
            color: '#717888',
            fontFamily: `'${settings.fontFamily}', 'JetBrains Mono', 'SF Mono', Menlo, Monaco, monospace`,
            fontSize: `${settings.fontSize}px`,
            lineHeight: `${cellHeight}px`,
            height: `${cellHeight}px`,
            letterSpacing: '0px',
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'pre',
            zIndex: 10,
            opacity: 0.85,
            transition: 'opacity 0.15s ease',
          }}
        >
          {ghostText}
        </span>
      )}

      {/* Reasoning query typing badge on active line */}
      {isTypingReasoning && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: `${Math.max(6, lineTop - 1)}px`,
            right: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: `'Inter', sans-serif`,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 10,
            backgroundColor: isModelLoading ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.12)',
            border: isModelLoading ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(56, 189, 248, 0.35)',
            color: isModelLoading ? '#eab308' : '#38bdf8',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
          }}
        >
          {isModelLoading ? (
            <>
              <Loader2 size={12} color="#eab308" style={{ animation: 'spin 1s linear infinite' }} />
              <span>Generating command…</span>
            </>
          ) : (
            <>
              <Brain size={12} color="#38bdf8" />
              <span>↵ or Tab replaces @ with cmd</span>
            </>
          )}
        </div>
      )}

      {/* Model loading indicator */}
      {isModelLoading && !inlineSuggestion && !isTypingReasoning && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: `${Math.max(6, lineTop - 1)}px`,
            right: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: `'Inter', sans-serif`,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 10,
            backgroundColor: 'rgba(251, 191, 36, 0.12)',
            border: '1px solid rgba(251, 191, 36, 0.4)',
            color: '#fbbf24',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
            transition: 'all 0.12s ease-out',
          }}
        >
          <Loader2 size={12} color="#fbbf24" style={{ animation: 'spin 1s linear infinite' }} />
          <span>{getModelDisplayName(settings?.aiModel)} generating…</span>
        </div>
      )}

      {inlineSuggestion && !isTypingReasoning && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: `${Math.max(6, lineTop - 1)}px`,
            right: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: `'Inter', sans-serif`,
            pointerEvents: 'auto',
            cursor: 'pointer',
            userSelect: 'none',
            zIndex: 10,
            backgroundColor:
              inlineSuggestion.mode === 'snippet'
                ? 'rgba(236, 72, 153, 0.2)'
                : 'var(--btn-secondary-bg, rgba(56, 189, 248, 0.16))',
            border:
              inlineSuggestion.mode === 'snippet'
                ? '1px solid rgba(236, 72, 153, 0.5)'
                : '1px solid var(--theme-primary, #38bdf8)',
            color:
              inlineSuggestion.mode === 'snippet'
                ? '#f472b6'
                : 'var(--theme-primary, #38bdf8)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
            transition: 'all 0.12s ease-out',
          }}
          onClick={() => {
            const activeSug = inlineSuggestionRef.current;
            if (activeSug && activeSug.command) {
              replacePromptWithCommand(activeSug.command);
              termRef.current?.focus();
            }
          }}
        >
          {inlineSuggestion.mode === 'snippet' ? (
            <>
              <FileCode2 size={12} color="#f472b6" />
              <span>Snippet{inlineSuggestion.snippetTitle ? `: ${inlineSuggestion.snippetTitle}` : ''} · Tab ⇥</span>
            </>
          ) : (
            <>
              <Sparkles size={12} color="var(--theme-primary, #38bdf8)" />
              <span>{inlineSuggestion.model || getModelDisplayName(settings?.aiModel)} · Tab ⇥</span>
            </>
          )}
        </div>
      )}

        </div>

      {/* Host Key Verification Modal Overlay */}
      {hostKeyPrompt && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(10, 10, 15, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#16161e',
              border: '1px solid #f59e0b',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f59e0b',
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={22} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                  Unknown SSH Host Key
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                  Verification required for {hostKeyPrompt.hostname}:{hostKeyPrompt.port}
                </p>
              </div>
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: '1.6',
              }}
            >
              The authenticity of host <strong>{hostKeyPrompt.hostname}:{hostKeyPrompt.port}</strong> cannot be established from existing known hosts.
              Please verify that this fingerprint matches your server:
            </div>

            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#0f0f17',
                border: '1px solid #27273a',
                borderRadius: '8px',
                fontFamily: `'JetBrains Mono', 'Fira Code', monospace`,
                fontSize: '12px',
                color: '#38bdf8',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {hostKeyPrompt.message}
            </div>

            <div
              style={{
                fontSize: '11px',
                color: '#64748b',
                lineHeight: '1.4',
              }}
            >
              Trusting this key will persist it into your user <code>~/.ssh/known_hosts</code> file. Future connections will strictly enforce this identity.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => {
                  setHostKeyPrompt(null);
                  termRef.current?.writeln('\x1b[1;38;2;239;68;68m✖ Host key rejected by user. Connection terminated.\x1b[0m\r\n');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#27273a',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                Reject & Cancel
              </button>
              <button
                onClick={handleTrustHostKey}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid transparent',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <ShieldCheck size={15} />
                <span>Trust & Connect</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

