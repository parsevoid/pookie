import { useEffect } from 'react';
import { useAppState } from './stores/appState';
import { SidebarView } from './components/Sidebar/SidebarView';
import { TabBarView } from './components/TabBar/TabBarView';
import { TerminalView } from './components/Terminal/TerminalView';
import { AICommandPaletteView } from './components/AICommandPalette/AICommandPaletteView';
import { SnippetCommandPaletteView } from './components/SnippetCommandPalette/SnippetCommandPaletteView';
import { SSHHostsView } from './components/Views/SSHHostsView';
import { SSHKeysView } from './components/Views/SSHKeysView';
import { SFTPFilesView } from './components/Views/SFTPFilesView';
import { SnippetsView } from './components/Views/SnippetsView';
import { HistoryView } from './components/Views/HistoryView';
import { NewConnectionModal } from './components/Modals/NewConnectionModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { ColorPalette, applyThemeCssVariables } from './styles/theme';
import logoImg from './assets/logo.png';
import { ExternalLink, ArrowDownToDot } from 'lucide-react';

export function App() {
  const appState = useAppState();
  const {
    selectedTool,
    setSelectedTool,
    tabs,
    activeTabId,
    setActiveTabId,
    closeTab,
    createTab,
    toggleTabPopUp,
    dockTab,
    openNewDetachedTab,
    focusDetachedWindow,
    settings,
    setSettings,
    showNewConnection,
    setShowNewConnection,
    showSettings,
    setShowSettings,
    settingsTab,
    openModelManagerInSettings: _openModelManagerInSettings,
    showAIPalette,
    setShowAIPalette,
    showSnippetPalette,
    setShowSnippetPalette,
    showModelManager,
    setShowModelManager,
    snippets,
    sshKeys,
    runCommandInTerminal,
    registerExecutor,
    unregisterExecutor,
    setConnections,
    connections,
    showSftpSidePanel,
    setShowSftpSidePanel,
    toggleSftpSidePanel,
    sftpSidePanelWidth,
  } = appState;

  // Real-time CSS tokens injection for complete UI reactivity
  useEffect(() => {
    if (settings.customPalette) {
      applyThemeCssVariables(
        settings.customPalette,
        settings.backgroundOpacity,
        settings.sizePreset || 'standard'
      );
    }
  }, [settings.customPalette, settings.backgroundOpacity, settings.sizePreset]);

  const bgImageSrc =
    settings.backgroundImage === 'cyberpunk'
      ? '/src/assets/cyber_terminal_wallpaper.jpg'
      : settings.backgroundImage === 'gradient'
      ? 'radial-gradient(ellipse at 80% 20%, rgba(139, 92, 246, 0.25) 0%, rgba(9, 11, 16, 0.95) 70%)'
      : settings.backgroundImage === 'custom' && settings.backgroundCustomUrl
      ? settings.backgroundCustomUrl
      : null;
  const isImageFile = bgImageSrc && !bgImageSrc.startsWith('radial-gradient');

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isSshActive = Boolean(
    activeTab?.connectionId && (
      activeTab.connectionId.startsWith('conn-ssh-') ||
      connections.some((c) => c.id === activeTab.connectionId && (c.type === 'ssh' || (c as any).protocol === 'ssh'))
    )
  );
  const activeTargetEnv = isSshActive ? 'ssh' : 'local';

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        backgroundColor: settings.customPalette?.background || ColorPalette.background,
        color: settings.customPalette?.text || ColorPalette.textPrimary,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ─── CUSTOMIZABLE WALLPAPER LAYER ─── */}
      {bgImageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: isImageFile ? `url(${bgImageSrc})` : bgImageSrc,
            backgroundSize: isImageFile ? 'cover' : undefined,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: settings.backgroundBlur ? `blur(${settings.backgroundBlur}px)` : undefined,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ─── ADJUSTABLE OPACITY DIMMING OVERLAY ─── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: settings.customPalette?.background || '#090b10',
          opacity: settings.backgroundOpacity ?? 0.88,
          zIndex: 1,
          pointerEvents: 'none',
          transition: 'opacity 0.15s ease, background-color 0.2s ease',
        }}
      />

      {/* ─── MAIN APP CONTAINER (Z-INDEX 2) ─── */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Sidebar Navigation */}
        <SidebarView appState={appState} />

        {/* Main Content Area */}
        <main
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'transparent',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
        {/* Sidebar Tool Views (Overlay when active) */}
        {selectedTool === 'sshHosts' && <SSHHostsView appState={appState} />}
        {selectedTool === 'sshKeys' && <SSHKeysView appState={appState} />}
        {selectedTool === 'sftp' && (
          <SFTPFilesView
            appState={appState}
            initialHost={appState.selectedSftpHost}
            isSidePanel={false}
            onDockToSidePanel={() => {
              setShowSftpSidePanel(true);
              setSelectedTool(null);
            }}
          />
        )}
        {selectedTool === 'snippets' && <SnippetsView appState={appState} />}
        {selectedTool === 'history' && <HistoryView appState={appState} />}

        {/* Terminal Console Area (Always mounted to keep all background sessions and listeners alive) */}
        <div
          style={{
            flex: 1,
            height: '100%',
            display: selectedTool === null ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <TabBarView
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={(id) => setActiveTabId(id)}
            onCloseTab={(id) => closeTab(id)}
            onNewTab={() => createTab('Terminal')}
            onNewDetachedTab={openNewDetachedTab}
            onOpenAI={() => setShowAIPalette(true)}
            showSftpSidePanel={showSftpSidePanel}
            onToggleSftpPanel={toggleSftpSidePanel}
            onTogglePopUp={toggleTabPopUp}
          />

          {/* Split Workspace: Terminal Sessions on Left + SFTP Side Window on Right */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Terminal Sessions (All tabs stay alive in background across switches) */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                height: '100%',
              }}
            >
              {tabs.map((tab) => {
                const isTabActive = tab.id === activeTabId;

                // When popped up to a separate window, show high-aesthetic detached state
                if (tab.isPoppedUp) {
                  if (!isTabActive) return null;
                  return (
                    <div
                      key={tab.id}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                        textAlign: 'center',
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '460px',
                          width: '100%',
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${settings.customPalette?.border || 'rgba(255, 255, 255, 0.08)'}`,
                          borderRadius: '16px',
                          padding: '32px 24px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '16px',
                          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
                          backdropFilter: 'blur(10px)',
                        }}
                      >
                        <img
                          src={logoImg}
                          alt="Pookie"
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            objectFit: 'contain',
                            boxShadow: `0 0 20px ${settings.customPalette?.primary || '#38bdf8'}40`,
                          }}
                        />

                        <div>
                          <h3
                            style={{
                              margin: '0 0 6px 0',
                              fontSize: '16px',
                              fontWeight: 600,
                              color: settings.customPalette?.text || '#f8fafc',
                            }}
                          >
                            {tab.title}
                          </h3>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '3px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 500,
                              backgroundColor: 'rgba(56, 189, 248, 0.12)',
                              color: settings.customPalette?.primary || '#38bdf8',
                              border: `1px solid ${settings.customPalette?.primary ? settings.customPalette.primary + '33' : 'rgba(56, 189, 248, 0.25)'}`,
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: '#10b981',
                                boxShadow: '0 0 6px #10b981',
                              }}
                            />
                            <span>Active in Detached Desktop Window</span>
                          </div>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: '12.5px',
                            color: ColorPalette.textMuted,
                            lineHeight: 1.5,
                          }}
                        >
                          This terminal tab is currently running in its own independent desktop window. You can interact with it there or dock it back.
                        </p>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => focusDetachedWindow(tab.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              backgroundColor: settings.customPalette?.primary || '#38bdf8',
                              color: '#090b10',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: 'none',
                              transition: 'opacity 0.12s ease',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                          >
                            <ExternalLink size={14} />
                            <span>Bring Window to Front</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => dockTab(tab.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: `1px solid ${settings.customPalette?.border || 'rgba(255, 255, 255, 0.12)'}`,
                              color: settings.customPalette?.text || '#f8fafc',
                              fontSize: '12.5px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 0.12s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.14)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                            }}
                          >
                            <ArrowDownToDot size={14} />
                            <span>Dock Back Here</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={tab.id}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: isTabActive ? 1 : 0,
                      transform: isTabActive ? 'none' : 'translateY(2px) scale(0.995)',
                      transition: 'opacity 0.14s cubic-bezier(0.16, 1, 0.3, 1)',
                      visibility: isTabActive ? 'visible' : 'hidden',
                      pointerEvents: isTabActive ? 'auto' : 'none',
                      zIndex: isTabActive ? 1 : 0,
                    }}
                  >
                    <TerminalView
                      tab={tab}
                      isActive={isTabActive}
                      settings={settings}
                      registerExecutor={registerExecutor}
                      unregisterExecutor={unregisterExecutor}
                      snippets={snippets}
                      connections={connections}
                      recordCommand={appState.recordCommand}
                      isToolOpen={selectedTool !== null}
                      onTogglePopUp={toggleTabPopUp}
                    />
                  </div>
                );
              })}
            </div>

            {/* Side Window for SFTP File System */}
            {showSftpSidePanel && (
              <div
                style={{
                  width: `${sftpSidePanelWidth}px`,
                  minWidth: '320px',
                  maxWidth: '850px',
                  height: '100%',
                  borderLeft: `1px solid ${ColorPalette.separator}`,
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: ColorPalette.background,
                  position: 'relative',
                  boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
                  zIndex: 2,
                }}
              >
                <SFTPFilesView
                  appState={appState}
                  isSidePanel={true}
                  onCloseSidePanel={() => setShowSftpSidePanel(false)}
                  onExpandToFullView={() => {
                    setShowSftpSidePanel(false);
                    setSelectedTool('sftp');
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>

      {/* AI Command Palette Modal (Cmd+I) */}
      <AICommandPaletteView
        isOpen={showAIPalette}
        onClose={() => setShowAIPalette(false)}
        onRunCommand={runCommandInTerminal}
        snippets={snippets}
        settings={settings}
        targetEnv={activeTargetEnv}
      />

      {/* Snippet Command Palette Modal (Cmd+P) */}
      <SnippetCommandPaletteView
        isOpen={showSnippetPalette}
        onClose={() => setShowSnippetPalette(false)}
        snippets={snippets}
        onRunSnippet={runCommandInTerminal}
      />

      {/* New Connection Modal */}
      <NewConnectionModal
        isOpen={showNewConnection}
        onClose={() => setShowNewConnection(false)}
        onAddConnection={(conn) => {
          setConnections([...connections, conn]);
          createTab(conn.name, conn.id);
        }}
        sshKeys={sshKeys}
      />

      {/* Settings Modal (Houses Terminal, Model Manager, and System) */}
      <SettingsModal
        isOpen={showSettings || showModelManager}
        onClose={() => {
          setShowSettings(false);
          setShowModelManager(false);
        }}
        initialTab={showModelManager ? 'models' : settingsTab}
        settings={settings}
        onUpdateSettings={setSettings}
      />
    </div>
  );
}

export default App;
