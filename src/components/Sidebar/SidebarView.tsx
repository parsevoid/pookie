import React from 'react';
import {
  Terminal as TerminalIcon,
  Server,
  Key,
  FolderTree,
  FileCode2,
  History,
  Settings,
  Plus,
  X,
} from 'lucide-react';
import type { AppStateContext, SidebarTool } from '../../stores/appState';
import { ColorPalette } from '../../styles/theme';
import logoImg from '../../assets/logo.png';

interface SidebarViewProps {
  appState: AppStateContext;
}

export const SidebarView: React.FC<SidebarViewProps> = ({ appState }) => {
  const {
    selectedTool,
    setSelectedTool,
    selectedConnectionId,
    connections,
    selectConnection,
    removeConnection,
    setShowNewConnection,
    setShowSettings,
  } = appState;

  const palette = appState.settings?.customPalette;
  const primaryColor = palette?.primary || '#38bdf8';
  const textColor = palette?.text || ColorPalette.textPrimary;
  const textMuted = palette?.textSecondary || ColorPalette.textMuted;
  const sidebarBg = palette?.sidebarBg || ColorPalette.sidebarBackground;

  const tools: { id: SidebarTool; label: string; icon: React.ReactNode; shortcut?: string }[] = [
    {
      id: 'sshHosts',
      label: 'SSH Hosts',
      icon: <Server size={15} />,
    },
    {
      id: 'sshKeys',
      label: 'SSH Keys',
      icon: <Key size={15} />,
    },
    {
      id: 'sftp',
      label: 'SFTP Files',
      icon: <FolderTree size={15} />,
    },
    {
      id: 'snippets',
      label: 'Snippets',
      icon: <FileCode2 size={15} />,
      shortcut: '⌘P',
    },
    {
      id: 'history',
      label: 'History',
      icon: <History size={15} />,
    },
  ];

  return (
    <aside
      style={{
        width: '230px',
        minWidth: '230px',
        backgroundColor: sidebarBg,
        borderRight: `1px solid ${ColorPalette.separator}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        userSelect: 'none',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Minimalist Brand Header */}
      <div
        style={{
          padding: '14px 14px 12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${ColorPalette.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          {/* Application Logo */}
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${primaryColor}14`,
              border: `1px solid ${primaryColor}40`,
              boxShadow: `0 2px 8px ${primaryColor}18`,
              flexShrink: 0,
            }}
          >
            <img
              src={logoImg}
              alt="Pookie Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.2px', color: textColor }}>
                Pookie
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'monospace',
                  color: textMuted,
                  letterSpacing: '0.2px',
                }}
              >
                v0.1
              </span>
            </div>
            <div style={{ fontSize: '10px', color: textMuted, letterSpacing: '0.2px' }}>
              Terminal &amp; SSH
            </div>
          </div>
        </div>

        <button
          title="New Connection"
          onClick={() => setShowNewConnection(true)}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '5px',
            backgroundColor: `${primaryColor}12`,
            border: `1px solid ${primaryColor}28`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: primaryColor,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${primaryColor}24`;
            e.currentTarget.style.borderColor = primaryColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = `${primaryColor}12`;
            e.currentTarget.style.borderColor = `${primaryColor}28`;
          }}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Connections List */}
      <div style={{ padding: '12px 10px 4px 10px' }}>
        <div
          style={{
            fontSize: 'var(--font-size-xs, 10px)',
            fontWeight: 700,
            color: ColorPalette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            padding: '0 8px 6px 8px',
          }}
        >
          Connections
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {connections.map((conn) => {
            const isSelected = selectedTool === null && selectedConnectionId === conn.id;
            return (
              <div
                key={conn.id}
                onClick={() => selectConnection(conn)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '7px 10px',
                  borderRadius: '7px',
                  backgroundColor: isSelected ? ColorPalette.surfaceElevated : 'transparent',
                  color: isSelected ? ColorPalette.textPrimary : ColorPalette.textSecondary,
                  border: isSelected ? `1px solid ${ColorPalette.border}` : '1px solid transparent',
                  textAlign: 'left',
                  transition: 'background-color 0.12s ease',
                  fontSize: 'var(--tab-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                  }
                  const closeBtn = e.currentTarget.querySelector('.conn-close-btn') as HTMLElement;
                  if (closeBtn) closeBtn.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                  const closeBtn = e.currentTarget.querySelector('.conn-close-btn') as HTMLElement;
                  if (closeBtn) closeBtn.style.opacity = '0';
                }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: conn.status === 'connected' ? ColorPalette.accentGreen : ColorPalette.textMuted,
                  }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conn.name}
                </span>
                {(() => {
                  const badge = conn.type === 'ssh' ? { color: '#60A5FA', bg: 'rgba(59, 130, 246, 0.14)' }
                    : conn.type === 'ftp' ? { color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.14)' }
                    : conn.type === 'telnet' ? { color: '#34D399', bg: 'rgba(16, 185, 129, 0.14)' }
                    : conn.type === 'raw_tcp' ? { color: '#A78BFA', bg: 'rgba(139, 92, 246, 0.14)' }
                    : conn.type === 'serial' ? { color: '#F472B6', bg: 'rgba(236, 72, 153, 0.14)' }
                    : { color: ColorPalette.textMuted, bg: ColorPalette.surfaceHover };
                  return (
                    <span
                      style={{
                        fontSize: '9px',
                        color: badge.color,
                        backgroundColor: badge.bg,
                        padding: '2px 5px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        letterSpacing: '0.3px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {conn.type.replace('_', ' ')}
                    </span>
                  );
                })()}
                <button
                  type="button"
                  className="conn-close-btn"
                  title={`Close & remove tab: ${conn.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeConnection(conn.id);
                  }}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: ColorPalette.textMuted,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: 0,
                    transition: 'opacity 0.15s ease, color 0.15s ease, background-color 0.15s ease',
                    marginLeft: '2px',
                  }}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    e.currentTarget.style.color = ColorPalette.accentRed;
                    e.currentTarget.style.backgroundColor = 'rgba(230, 89, 102, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    e.currentTarget.style.color = ColorPalette.textMuted;
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tools List */}
      <div style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            fontSize: 'var(--font-size-xs, 10px)',
            fontWeight: 700,
            color: ColorPalette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            padding: '0 8px 6px 8px',
          }}
        >
          Tools
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Back to Terminal Button if tool active */}
          <button
            onClick={() => setSelectedTool(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              padding: '7px 10px',
              borderRadius: '6px',
              backgroundColor: selectedTool === null ? `${primaryColor}14` : 'transparent',
              color: selectedTool === null ? textColor : textMuted,
              border: selectedTool === null ? `1px solid ${primaryColor}38` : '1px solid transparent',
              textAlign: 'left',
              fontSize: 'var(--tab-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: selectedTool === null ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              if (selectedTool !== null) e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
            }}
            onMouseLeave={(e) => {
              if (selectedTool !== null) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <TerminalIcon size={15} color={selectedTool === null ? primaryColor : textMuted} />
            <span style={{ flex: 1 }}>Terminal Console</span>
          </button>

          {tools.map((tool) => {
            const isSelected = selectedTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setSelectedTool(tool.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  backgroundColor: isSelected ? `${primaryColor}14` : 'transparent',
                  color: isSelected ? textColor : textMuted,
                  border: isSelected ? `1px solid ${primaryColor}38` : '1px solid transparent',
                  textAlign: 'left',
                  fontSize: 'var(--tab-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ color: isSelected ? primaryColor : textMuted }}>
                  {tool.icon}
                </span>
                <span style={{ flex: 1 }}>{tool.label}</span>
                {tool.shortcut && (
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs, 10px)',
                      color: textMuted,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {tool.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings Footer */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: `1px solid ${ColorPalette.border}`,
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
        }}
      >
        <button
          onClick={() => setShowSettings(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            borderRadius: '6px',
            color: textMuted,
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.12s ease',
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = textColor;
            e.currentTarget.style.backgroundColor = `${primaryColor}12`;
            e.currentTarget.style.borderColor = `${primaryColor}28`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = textMuted;
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
