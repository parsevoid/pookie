import React from 'react';
import { Plus, X, Terminal, FolderTree, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import type { TerminalTab } from '../../stores/appState';
import { ColorPalette } from '../../styles/theme';

interface TabBarViewProps {
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onNewDetachedTab?: () => void;
  onOpenAI?: () => void;
  showSftpSidePanel?: boolean;
  onToggleSftpPanel?: () => void;
  onTogglePopUp?: (tabId: string) => void;
}

export const TabBarView: React.FC<TabBarViewProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewDetachedTab,
  showSftpSidePanel,
  onToggleSftpPanel,
  onTogglePopUp,
}) => {
  return (
    <div
      style={{
        height: 'var(--tab-height, 38px)',
        backgroundColor: 'var(--sidebar-bg, #1a1c24)',
        borderBottom: `1px solid ${ColorPalette.separator}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        userSelect: 'none',
        gap: '4px',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          overflowX: 'auto',
          flex: 1,
          scrollbarWidth: 'none',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '6px 6px 0 0',
                backgroundColor: isActive ? 'rgba(0, 0, 0, 0.35)' : 'transparent',
                color: isActive ? 'var(--text-primary, #e6e8ed)' : 'var(--text-secondary, #8c919e)',
                borderTop: isActive ? '2px solid var(--theme-primary, #38bdf8)' : '2px solid transparent',
                borderLeft: isActive ? `1px solid ${ColorPalette.border}` : '1px solid transparent',
                borderRight: isActive ? `1px solid ${ColorPalette.border}` : '1px solid transparent',
                fontSize: 'var(--tab-font-size, 12px)',
                fontFamily: 'var(--font-ui)',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                minWidth: '120px',
                maxWidth: '220px',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Terminal
                size={13}
                color={isActive ? 'var(--theme-primary, #38bdf8)' : ColorPalette.textMuted}
              />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.title}
              </span>

              {tab.isPoppedUp && (
                <span
                  title="Detached in separate desktop window"
                  style={{
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: 'rgba(56, 189, 248, 0.16)',
                    color: 'var(--theme-primary, #38bdf8)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    letterSpacing: '0.2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
                  WINDOW
                </span>
              )}

              {/* Pop-up / Focus Window Button */}
              <button
                type="button"
                title={tab.isPoppedUp ? 'Focus detached window' : 'Pop-up in separate desktop window'}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePopUp?.(tab.id);
                }}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: tab.isPoppedUp ? 'var(--theme-primary, #38bdf8)' : ColorPalette.textMuted,
                  backgroundColor: tab.isPoppedUp ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                  e.currentTarget.style.color = 'var(--theme-primary, #38bdf8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = tab.isPoppedUp ? 'rgba(56, 189, 248, 0.16)' : 'transparent';
                  e.currentTarget.style.color = tab.isPoppedUp ? 'var(--theme-primary, #38bdf8)' : ColorPalette.textMuted;
                }}
              >
                <ExternalLink size={11} />
              </button>

              <button
                type="button"
                title="Close tab (⌘W)"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
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
                  transition: 'all 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                  e.currentTarget.style.color = ColorPalette.accentRed;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = ColorPalette.textMuted;
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {/* New Tab Button */}
        <button
          title="New Tab (⌘T)"
          onClick={onNewTab}
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: ColorPalette.textSecondary,
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
          <Plus size={15} />
        </button>
      </div>

      {/* Right Side Actions */}
      {onToggleSftpPanel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <button
            type="button"
            title={showSftpSidePanel ? 'Close SFTP Side Window' : 'Open SFTP Side Window alongside Terminal'}
            onClick={onToggleSftpPanel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: showSftpSidePanel ? 'var(--btn-secondary-bg, rgba(56, 189, 248, 0.15))' : ColorPalette.surfaceElevated,
              color: showSftpSidePanel ? 'var(--theme-primary, #38bdf8)' : ColorPalette.textSecondary,
              border: `1px solid ${showSftpSidePanel ? 'var(--theme-primary, #38bdf8)' : ColorPalette.border}`,
              fontSize: 'var(--btn-font-size, 11px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              if (!showSftpSidePanel) {
                e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                e.currentTarget.style.color = ColorPalette.textPrimary;
              }
            }}
            onMouseLeave={(e) => {
              if (!showSftpSidePanel) {
                e.currentTarget.style.backgroundColor = ColorPalette.surfaceElevated;
                e.currentTarget.style.color = ColorPalette.textSecondary;
              }
            }}
          >
            <FolderTree size={13} color={showSftpSidePanel ? 'var(--theme-primary, #38bdf8)' : ColorPalette.textSecondary} />
            <span>SFTP Side Panel</span>
            {showSftpSidePanel && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--theme-primary, #38bdf8)',
                  boxShadow: '0 0 6px var(--theme-primary, #38bdf8)',
                }}
              />
            )}
          </button>
        </div>
      )}
    </div>
  );
};
