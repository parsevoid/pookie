import React, { useState } from 'react';
import { History, Search, Terminal, Copy, Check, Clock, Trash2, RefreshCw, X, Sparkles } from 'lucide-react';
import type { AppStateContext } from '../../stores/appState';
import { ColorPalette } from '../../styles/theme';

interface HistoryViewProps {
  appState: AppStateContext;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ appState }) => {
  const { history, runCommandInTerminal, deleteHistoryItem, clearHistory, loadShellHistory } = appState;
  const palette = appState.settings?.customPalette;
  const primaryColor = palette?.primary || '#38bdf8';
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = history.filter((h) =>
    h.command.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleRun = (cmd: string) => {
    runCommandInTerminal(cmd);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteHistoryItem(id);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      await loadShellHistory();
    } finally {
      setTimeout(() => setIsImporting(false), 600);
    }
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    clearHistory();
    setConfirmClear(false);
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  };

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
          padding: '16px 24px',
          borderBottom: `1px solid ${ColorPalette.separator}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: ColorPalette.background,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: `${primaryColor}18`,
              border: `1px solid ${primaryColor}38`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: primaryColor,
            }}
          >
            <History size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: 'var(--font-size-xl, 15px)', fontWeight: 600, color: ColorPalette.textPrimary, fontFamily: 'var(--font-ui)', margin: 0 }}>
                Command History
              </h1>
              <span
                style={{
                  fontSize: 'var(--font-size-xs, 10px)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: `${primaryColor}14`,
                  border: `1px solid ${primaryColor}33`,
                  color: primaryColor,
                }}
              >
                {filtered.length} {filtered.length === 1 ? 'command' : 'commands'}
              </span>
            </div>
            <p style={{ fontSize: 'var(--font-size-base, 12px)', color: ColorPalette.textSecondary, fontFamily: 'var(--font-ui)', margin: '2px 0 0 0' }}>
              Review executed terminal commands and re-run them with a single click.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)' }}>
          <button
            onClick={handleImport}
            disabled={isImporting}
            title="Import past commands from your shell history (~/.zsh_history or ~/.bash_history)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: ColorPalette.surfaceElevated,
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.textPrimary,
              fontSize: 'var(--btn-font-size, 11px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              cursor: isImporting ? 'default' : 'pointer',
              opacity: isImporting ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <RefreshCw size={12} className={isImporting ? 'animate-spin' : ''} />
            <span>{isImporting ? 'Importing...' : 'Sync Shell History'}</span>
          </button>

          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              title={confirmClear ? 'Click again to confirm clearing all history' : 'Clear all command history'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: confirmClear ? 'rgba(239, 68, 68, 0.2)' : ColorPalette.surfaceElevated,
                border: `1px solid ${confirmClear ? ColorPalette.accentRed : ColorPalette.border}`,
                color: confirmClear ? ColorPalette.accentRed : ColorPalette.textSecondary,
                fontSize: 'var(--btn-font-size, 11px)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Trash2 size={12} />
              <span>{confirmClear ? 'Confirm Clear?' : 'Clear All'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Toolbar */}
      <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'var(--font-ui)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 12px',
            borderRadius: '8px',
            backgroundColor: ColorPalette.surfaceElevated,
            border: `1px solid ${ColorPalette.border}`,
            flex: 1,
            maxWidth: '420px',
          }}
        >
          <Search size={14} color={ColorPalette.textMuted} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands (e.g. git, npm, docker, cargo)..."
            style={{
              background: 'transparent',
              border: 'none',
              color: ColorPalette.textPrimary,
              fontSize: 'var(--input-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              outline: 'none',
              flex: 1,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: ColorPalette.textMuted,
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* History List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 24px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: `${primaryColor}15`,
                border: `1px solid ${primaryColor}33`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: primaryColor,
              }}
            >
              <History size={24} />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: ColorPalette.textPrimary, margin: 0 }}>
                {search ? 'No commands match your search' : 'No commands in history yet'}
              </p>
              <p style={{ fontSize: '12px', color: ColorPalette.textMuted, margin: '4px 0 0 0', maxWidth: '380px' }}>
                {search
                  ? `No recorded commands matched "${search}". Try searching for another keyword.`
                  : 'Commands executed in your terminal tabs will appear here automatically, or you can sync your existing shell history.'}
              </p>
            </div>
            {!search && (
              <button
                onClick={handleImport}
                disabled={isImporting}
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: primaryColor,
                  color: '#090b10',
                  fontSize: 'var(--btn-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  border: 'none',
                  cursor: isImporting ? 'default' : 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <Sparkles size={14} />
                <span>{isImporting ? 'Syncing...' : 'Sync Existing Shell History'}</span>
              </button>
            )}
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: ColorPalette.surfaceElevated,
                borderRadius: '8px',
                border: `1px solid ${ColorPalette.border}`,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                transition: 'border-color 0.15s ease, background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${primaryColor}55`;
                e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = ColorPalette.border;
                e.currentTarget.style.backgroundColor = ColorPalette.surfaceElevated;
              }}
            >
              {/* Command Text */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <Terminal size={14} color={primaryColor} style={{ flexShrink: 0 }} />
                <code
                  title={item.command}
                  style={{
                    fontSize: '12px',
                    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
                    color: ColorPalette.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {item.command}
                </code>
              </div>

              {/* Actions & Timestamp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: ColorPalette.textMuted,
                  }}
                >
                  <Clock size={11} />
                  <span>{formatTime(item.timestamp)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Copy Button */}
                  <button
                    onClick={() => handleCopy(item.id, item.command)}
                    title="Copy command to clipboard"
                    style={{
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: ColorPalette.surfaceHover,
                      border: `1px solid ${ColorPalette.border}`,
                      color: copiedId === item.id ? ColorPalette.accentGreen : ColorPalette.textSecondary,
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>

                  {/* Run in Terminal Button */}
                  <button
                    onClick={() => handleRun(item.command)}
                    title="Run in active terminal"
                    style={{
                      padding: '5px 10px',
                      borderRadius: '5px',
                      backgroundColor: primaryColor,
                      border: 'none',
                      color: '#090b10',
                      fontSize: 'var(--font-size-sm, 11px)',
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer',
                      transition: 'transform 0.1s ease, opacity 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    <Terminal size={12} />
                    <span>Run</span>
                  </button>

                  {/* Delete Item Button */}
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    title="Delete from history"
                    style={{
                      padding: '5px 7px',
                      borderRadius: '5px',
                      backgroundColor: 'transparent',
                      border: `1px solid transparent`,
                      color: ColorPalette.textMuted,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = ColorPalette.accentRed;
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = ColorPalette.textMuted;
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
