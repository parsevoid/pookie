import React, { useState } from 'react';
import { Server, Plus, Play, Trash2, Key, Search, Tag, X, FolderTree, ShieldCheck, Lock, Activity, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { AppStateContext } from '../../stores/appState';
import { type SSHHost, createSSHHost, type AuthMethod } from '../../models/SSHHost';
import { ColorPalette } from '../../styles/theme';

interface SSHHostsViewProps {
  appState: AppStateContext;
}

export const SSHHostsView: React.FC<SSHHostsViewProps> = ({ appState }) => {
  const { sshHosts, setSshHosts, connectToSSHHost, sshKeys, setSelectedSftpHost, setSelectedTool } = appState;
  const palette = appState.settings?.customPalette;
  const primaryColor = palette?.primary || '#38bdf8';
  const textColor = palette?.text || ColorPalette.textPrimary;
  const textMuted = palette?.textSecondary || ColorPalette.textMuted;
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [testingHostId, setTestingHostId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; status?: string; message: string; latency_ms?: number; os_info?: string }>>({});

  const handleTestHost = async (host: SSHHost) => {
    setTestingHostId(host.id);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      let effectivePassword = host.password || null;
      if (!effectivePassword && host.authMethod === 'password') {
        try {
          const vaultPass = await invoke<string | null>('get_secure_credential', {
            service: 'myterminal_ssh',
            account: `${host.username}@${host.hostname}`,
          });
          if (vaultPass) effectivePassword = vaultPass;
        } catch {}
      }

      const result: any = await invoke('verify_ssh_connection', {
        config: {
          hostname: host.hostname,
          port: host.port || 22,
          username: host.username || '',
          auth_type: host.authMethod,
          key_path: host.keyPath || null,
          password: effectivePassword,
        },
      });
      setTestResults((prev) => ({ ...prev, [host.id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [host.id]: { success: false, message: String(err) },
      }));
    } finally {
      setTestingHostId(null);
    }
  };

  // New host form state
  const [label, setLabel] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('root');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('sshKey');
  const [password, setPassword] = useState('');
  const [keyPath, setKeyPath] = useState('~/.ssh/id_rsa');
  const [tags, setTags] = useState('');

  const filteredHosts = sshHosts.filter(
    (h) =>
      h.label.toLowerCase().includes(search.toLowerCase()) ||
      h.hostname.toLowerCase().includes(search.toLowerCase()) ||
      h.username.toLowerCase().includes(search.toLowerCase()) ||
      (h.tags && h.tags.some((t: string) => t.toLowerCase().includes(search.toLowerCase())))
  );

  const handleAddHost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !hostname.trim()) return;

    const trimmedUser = username.trim();
    const trimmedHost = hostname.trim();

    if (authMethod === 'password' && password) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('save_secure_credential', {
          service: 'myterminal_ssh',
          account: `${trimmedUser}@${trimmedHost}`,
          secret: password,
        }).catch((err) => console.warn('Could not save password to OS secure vault:', err));
      });
    }

    const newHost: SSHHost = createSSHHost({
      id: `host-${Date.now()}`,
      label: label.trim(),
      hostname: trimmedHost,
      port: Number(port) || 22,
      username: trimmedUser,
      authMethod,
      password: authMethod === 'password' ? password : null,
      keyPath: authMethod !== 'password' ? (keyPath.trim() || null) : null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

    setSshHosts([...sshHosts, newHost]);
    setShowAddModal(false);
    setLabel('');
    setHostname('');
    setPort(22);
    setUsername('root');
    setAuthMethod('sshKey');
    setPassword('');
    setKeyPath('~/.ssh/id_rsa');
    setTags('');
  };

  const handleDeleteHost = (id: string) => {
    const target = sshHosts.find((h) => h.id === id);
    if (target && target.authMethod === 'password') {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('delete_secure_credential', {
          service: 'myterminal_ssh',
          account: `${target.username}@${target.hostname}`,
        }).catch(() => {});
      });
    }
    setSshHosts(sshHosts.filter((h) => h.id !== id));
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
      {/* View Header */}
      <div
        style={{
          padding: '18px 24px',
          borderBottom: `1px solid ${ColorPalette.separator}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl, 15px)', fontWeight: 600, color: ColorPalette.textPrimary, fontFamily: 'var(--font-ui)', margin: 0 }}>
            SSH Hosts
          </h1>
          <p style={{ fontSize: 'var(--font-size-base, 12px)', color: ColorPalette.textSecondary, fontFamily: 'var(--font-ui)', margin: '2px 0 0 0' }}>
            Manage remote servers, cloud instances, and quick SSH connections.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '6px',
            backgroundColor: primaryColor,
            color: '#090b10',
            fontSize: 'var(--btn-font-size, 12px)',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={15} />
          <span>Add SSH Host</span>
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '14px 24px 8px 24px', fontFamily: 'var(--font-ui)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: ColorPalette.surfaceElevated,
            border: `1px solid ${ColorPalette.border}`,
            maxWidth: '360px',
          }}
        >
          <Search size={15} color={textMuted} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hosts by name, IP, or tag..."
            style={{
              background: 'transparent',
              border: 'none',
              color: textColor,
              fontSize: 'var(--input-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              flex: 1,
            }}
          />
        </div>
      </div>

      {/* Host Cards Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '14px',
          alignContent: 'start',
        }}
      >
        {filteredHosts.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '60px 20px',
              textAlign: 'center',
              color: ColorPalette.textMuted,
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Server size={32} color={ColorPalette.textMuted} />
            <div>No SSH hosts added yet.</div>
            <div style={{ fontSize: '11px', maxWidth: '360px' }}>
              Only remote hosts you explicitly save in your app database will be listed here.
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                marginTop: '6px',
                padding: '7px 16px',
                borderRadius: '6px',
                backgroundColor: primaryColor,
                color: '#090b10',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add First SSH Host
            </button>
          </div>
        ) : (
          filteredHosts.map((host) => (
            <div
              key={host.id}
              style={{
                backgroundColor: ColorPalette.surfaceElevated,
                borderRadius: '10px',
                border: `1px solid ${ColorPalette.border}`,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = primaryColor)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = ColorPalette.border)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
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
                    <Server size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: ColorPalette.textPrimary }}>
                      {host.label}
                    </div>
                    <div style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontFamily: 'monospace' }}>
                      {host.username}@{host.hostname}:{host.port}
                    </div>
                  </div>
                </div>

                <button
                  title="Delete Host"
                  onClick={() => handleDeleteHost(host.id)}
                  style={{
                    color: ColorPalette.textMuted,
                    padding: '4px',
                    borderRadius: '4px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = ColorPalette.accentRed)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = ColorPalette.textMuted)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Auth method indicator */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: ColorPalette.textMuted,
                  fontFamily: 'monospace',
                }}
              >
                {host.authMethod === 'fido2' || host.authMethod === 'passkey' ? (
                  <>
                    <ShieldCheck size={13} color={ColorPalette.accentCyan} />
                    <span style={{ color: ColorPalette.accentCyan, fontWeight: 600 }}>FIDO2 / Passkey Security Key</span>
                  </>
                ) : host.authMethod === 'password' ? (
                  <>
                    <Lock size={13} color={ColorPalette.accentGreen} />
                    <span style={{ color: ColorPalette.accentGreen, fontWeight: 600 }}>Password Authentication</span>
                  </>
                ) : (
                  <>
                    <Key size={13} color={ColorPalette.accentYellow} />
                    <span>{host.keyPath || '~/.ssh/id_rsa'}</span>
                  </>
                )}
              </div>

              {host.tags && host.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {host.tags.map((tag: string) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: ColorPalette.surfaceHover,
                        color: ColorPalette.textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      <Tag size={9} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Diagnostic Test Result Badge */}
              {testResults[host.id] && (
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: testResults[host.id].success
                      ? 'rgba(34, 197, 94, 0.1)'
                      : testResults[host.id].status === 'untrusted_host_key'
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${
                      testResults[host.id].success
                        ? 'rgba(34, 197, 94, 0.25)'
                        : testResults[host.id].status === 'untrusted_host_key'
                        ? 'rgba(245, 158, 11, 0.35)'
                        : 'rgba(239, 68, 68, 0.25)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: testResults[host.id].success
                      ? '#4ade80'
                      : testResults[host.id].status === 'untrusted_host_key'
                      ? '#fbbf24'
                      : '#f87171',
                  }}
                >
                  {testResults[host.id].success ? (
                    <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                  ) : (
                    <AlertCircle size={12} style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {testResults[host.id].success
                      ? `Verified (${testResults[host.id].latency_ms}ms) • ${testResults[host.id].os_info || 'Authenticated'}`
                      : testResults[host.id].message}
                  </span>
                  {testResults[host.id].status === 'untrusted_host_key' && testResults[host.id].os_info && (
                    <button
                      onClick={async () => {
                        try {
                          const { invoke } = await import('@tauri-apps/api/core');
                          await invoke('ssh_trust_host_key', { rawKeyLine: testResults[host.id].os_info });
                          handleTestHost(host);
                        } catch (err) {
                          console.error('Failed to trust host key:', err);
                        }
                      }}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Trust Key
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons: Connect Terminal, Test & SFTP Files */}
              <div style={{ paddingTop: '8px', borderTop: `1px solid ${ColorPalette.border}`, display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '6px' }}>
                <button
                  onClick={() => connectToSSHHost(host)}
                  style={{
                    padding: '7px 0',
                    borderRadius: '6px',
                    backgroundColor: primaryColor,
                    color: '#090b10',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <Play size={11} fill="#090b10" />
                  <span>Connect</span>
                </button>

                <button
                  onClick={() => handleTestHost(host)}
                  disabled={testingHostId === host.id}
                  title="Run pre-flight test & analyze credentials"
                  style={{
                    padding: '7px 0',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.accentGreen,
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    opacity: testingHostId === host.id ? 0.7 : 1,
                  }}
                >
                  {testingHostId === host.id ? (
                    <Loader2 size={12} />
                  ) : (
                    <Activity size={12} />
                  )}
                  <span>{testingHostId === host.id ? 'Testing...' : 'Test'}</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedSftpHost(host);
                    setSelectedTool('sftp');
                  }}
                  title="Explore remote files via SFTP"
                  style={{
                    padding: '7px 0',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.accentCyan,
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                  }}
                >
                  <FolderTree size={12} />
                  <span>SFTP</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Host Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              width: '460px',
              backgroundColor: '#161922',
              borderRadius: '12px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: ColorPalette.textPrimary }}>Add SSH Host</h2>
              <button onClick={() => setShowAddModal(false)} style={{ color: ColorPalette.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddHost} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Label Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Production Web"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Hostname / IP
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="192.168.1.100 or domain.com"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: ColorPalette.surfaceElevated,
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textPrimary,
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Port
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: ColorPalette.surfaceElevated,
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textPrimary,
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Username
                </label>
                <input
                  type="text"
                  placeholder="ubuntu, root, admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                  }}
                />
              </div>

              {/* Auth Method Selector */}
              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Authentication Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('sshKey')}
                    style={{
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: authMethod === 'sshKey' ? `${primaryColor}25` : ColorPalette.surfaceElevated,
                      border: `1px solid ${authMethod === 'sshKey' ? primaryColor : ColorPalette.border}`,
                      color: authMethod === 'sshKey' ? '#ffffff' : ColorPalette.textSecondary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <Key size={12} color={authMethod === 'sshKey' ? primaryColor : ColorPalette.textMuted} />
                    <span>SSH Key</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthMethod('password')}
                    style={{
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: authMethod === 'password' ? `${ColorPalette.accentGreen}25` : ColorPalette.surfaceElevated,
                      border: `1px solid ${authMethod === 'password' ? ColorPalette.accentGreen : ColorPalette.border}`,
                      color: authMethod === 'password' ? '#ffffff' : ColorPalette.textSecondary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <Lock size={12} color={authMethod === 'password' ? ColorPalette.accentGreen : ColorPalette.textMuted} />
                    <span>Password</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthMethod('fido2')}
                    style={{
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: authMethod === 'fido2' ? `${ColorPalette.accentCyan}25` : ColorPalette.surfaceElevated,
                      border: `1px solid ${authMethod === 'fido2' ? ColorPalette.accentCyan : ColorPalette.border}`,
                      color: authMethod === 'fido2' ? '#ffffff' : ColorPalette.textSecondary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <ShieldCheck size={12} color={authMethod === 'fido2' ? ColorPalette.accentCyan : ColorPalette.textMuted} />
                    <span>Passkey / FIDO2</span>
                  </button>
                </div>

                {authMethod === 'password' ? (
                  <div>
                    <label style={{ fontSize: '10px', color: ColorPalette.textMuted, display: 'block', marginBottom: '4px' }}>
                      Server Password (optional, will prompt in terminal if left blank)
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: ColorPalette.surfaceElevated,
                        border: `1px solid ${ColorPalette.border}`,
                        color: ColorPalette.textPrimary,
                        fontSize: '12px',
                      }}
                    />
                  </div>
                ) : authMethod === 'fido2' ? (
                  <div>
                    <label style={{ fontSize: '10px', color: ColorPalette.textMuted, display: 'block', marginBottom: '4px' }}>
                      FIDO2 / Passkey Security Key Path
                    </label>
                    <input
                      type="text"
                      placeholder="~/.ssh/id_ed25519_sk or hardware resident key"
                      value={keyPath}
                      onChange={(e) => setKeyPath(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: ColorPalette.surfaceElevated,
                        border: `1px solid ${ColorPalette.border}`,
                        color: ColorPalette.textPrimary,
                        fontSize: '12px',
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '10px', color: ColorPalette.textMuted }}>
                        Private Key Path
                      </label>
                      {sshKeys.length > 0 && (
                        <select
                          onChange={(e) => {
                            if (e.target.value) setKeyPath(e.target.value);
                          }}
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: primaryColor,
                            fontSize: '10px',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="">Select saved key…</option>
                          {sshKeys.map((k) => (
                            <option key={k.id} value={k.privateKeyPath || k.path}>
                              {k.name} ({k.keyType})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="~/.ssh/id_rsa or ~/.ssh/id_ed25519"
                      value={keyPath}
                      onChange={(e) => setKeyPath(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: ColorPalette.surfaceElevated,
                        border: `1px solid ${ColorPalette.border}`,
                        color: ColorPalette.textPrimary,
                        fontSize: '12px',
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="production, aws, db"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    color: ColorPalette.textSecondary,
                    fontSize: '12px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    backgroundColor: primaryColor,
                    color: '#090b10',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Host
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
