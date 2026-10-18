import React, { useState } from 'react';
import { X, Terminal, Server, Key, Lock, ShieldCheck, FolderTree, Radio, Network, Cpu } from 'lucide-react';
import { type Connection, createConnection, type SSHAuthType, type ConnectionType } from '../../models/Connection';
import type { SSHKey } from '../../models/SSHKey';
import { ColorPalette } from '../../styles/theme';

interface NewConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddConnection: (conn: Connection) => void;
  sshKeys?: SSHKey[];
}

const PROTOCOLS: { id: ConnectionType; label: string; icon: React.ReactNode; defaultPort: number; color: string }[] = [
  { id: 'ssh', label: 'SSH Remote', icon: <Server size={13} />, defaultPort: 22, color: 'var(--theme-primary, #38bdf8)' },
  { id: 'ftp', label: 'FTP Server', icon: <FolderTree size={13} />, defaultPort: 21, color: ColorPalette.accentCyan },
  { id: 'telnet', label: 'Telnet Host', icon: <Radio size={13} />, defaultPort: 23, color: ColorPalette.accentYellow },
  { id: 'raw_tcp', label: 'Raw Socket', icon: <Network size={13} />, defaultPort: 8080, color: ColorPalette.accentBlue },
  { id: 'serial', label: 'Serial COM', icon: <Cpu size={13} />, defaultPort: 115200, color: '#f97316' },
  { id: 'local', label: 'Local Shell', icon: <Terminal size={13} />, defaultPort: 0, color: ColorPalette.accentGreen },
];

export const NewConnectionModal: React.FC<NewConnectionModalProps> = ({
  isOpen,
  onClose,
  onAddConnection,
  sshKeys = [],
}) => {
  const [type, setType] = useState<ConnectionType>('ssh');
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('root');
  const [authType, setAuthType] = useState<SSHAuthType>('sshKey');
  const [password, setPassword] = useState('');
  const [keyPath, setKeyPath] = useState('~/.ssh/id_rsa');

  if (!isOpen) return null;

  const handleSelectProtocol = (pId: ConnectionType) => {
    setType(pId);
    const p = PROTOCOLS.find((x) => x.id === pId);
    if (p) {
      setPort(p.defaultPort);
      if (pId === 'ftp') {
        setUsername('anonymous');
      } else if (pId === 'ssh') {
        setUsername('root');
      } else if (pId === 'serial') {
        setHostname('/dev/cu.usbserial-10');
      } else {
        setUsername('');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const conn: Connection = createConnection({
      id: `conn-${Date.now()}`,
      name: name.trim() || (type === 'local' ? 'Local Terminal' : `${type.toUpperCase()} - ${hostname}`),
      hostname: type === 'local' ? 'localhost' : hostname.trim(),
      port: type === 'local' ? 0 : Number(port) || 22,
      username: type === 'local' ? '' : username.trim(),
      password: (authType === 'password' || type === 'ftp' || type === 'telnet') ? password : '',
      type,
      authType,
      status: 'connected',
      sortOrder: Date.now(),
      sshKeyPath: type === 'ssh' && authType !== 'password' ? keyPath.trim() : '',
    });

    onAddConnection(conn);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: '500px',
          backgroundColor: '#161922',
          borderRadius: '12px',
          border: `1px solid ${ColorPalette.border}`,
          padding: '22px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: ColorPalette.textPrimary }}>New Communication Channel</h2>
            <p style={{ fontSize: '11px', color: ColorPalette.textSecondary, marginTop: '2px' }}>
              Connect via SSH, FTP, Telnet, Raw Sockets, Serial, or Local Shell.
            </p>
          </div>
          <button onClick={onClose} style={{ color: ColorPalette.textMuted }}>
            <X size={16} />
          </button>
        </div>

        {/* Multi-Protocol Selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Connection Protocol / Channel
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {PROTOCOLS.map((p) => {
              const isSel = type === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectProtocol(p.id)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '7px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: isSel ? `${p.color}25` : ColorPalette.surfaceElevated,
                    border: `1px solid ${isSel ? p.color : ColorPalette.border}`,
                    color: isSel ? '#ffffff' : ColorPalette.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span style={{ color: isSel ? p.color : ColorPalette.textMuted }}>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Connection Name
            </label>
            <input
              type="text"
              required
              placeholder={type === 'local' ? 'Local Workstation' : `${type.toUpperCase()} Server`}
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          {type !== 'local' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    {type === 'serial' ? 'Serial Device Path' : 'Hostname / IP Address'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={type === 'serial' ? '/dev/cu.usbserial or COM3' : '192.168.1.1 or host.com'}
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
                    {type === 'serial' ? 'Baud Rate' : 'Port'}
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

              {type !== 'raw_tcp' && type !== 'serial' && (
                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Username {type === 'telnet' ? '(Optional)' : ''}
                  </label>
                  <input
                    type="text"
                    placeholder={type === 'ftp' ? 'anonymous' : 'root'}
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
              )}

              {/* Password field for FTP and Telnet */}
              {(type === 'ftp' || type === 'telnet') && (
                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Password {type === 'telnet' ? '(Optional)' : ''}
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
              )}

              {/* Auth Method Selector for SSH */}
              {type === 'ssh' && (
                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Authentication Method
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setAuthType('sshKey')}
                      style={{
                        padding: '7px 4px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: authType === 'sshKey' ? 'var(--btn-secondary-bg, rgba(56, 189, 248, 0.15))' : ColorPalette.surfaceElevated,
                        border: `1px solid ${authType === 'sshKey' ? 'var(--theme-primary, #38bdf8)' : ColorPalette.border}`,
                        color: authType === 'sshKey' ? '#ffffff' : ColorPalette.textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Key size={12} color={authType === 'sshKey' ? 'var(--theme-primary, #38bdf8)' : ColorPalette.textMuted} />
                      <span>SSH Key</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuthType('password')}
                      style={{
                        padding: '7px 4px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: authType === 'password' ? `${ColorPalette.accentGreen}25` : ColorPalette.surfaceElevated,
                        border: `1px solid ${authType === 'password' ? ColorPalette.accentGreen : ColorPalette.border}`,
                        color: authType === 'password' ? '#ffffff' : ColorPalette.textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Lock size={12} color={authType === 'password' ? ColorPalette.accentGreen : ColorPalette.textMuted} />
                      <span>Password</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuthType('fido2')}
                      style={{
                        padding: '7px 4px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: authType === 'fido2' ? `${ColorPalette.accentCyan}25` : ColorPalette.surfaceElevated,
                        border: `1px solid ${authType === 'fido2' ? ColorPalette.accentCyan : ColorPalette.border}`,
                        color: authType === 'fido2' ? '#ffffff' : ColorPalette.textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <ShieldCheck size={12} color={authType === 'fido2' ? ColorPalette.accentCyan : ColorPalette.textMuted} />
                      <span>Passkey</span>
                    </button>
                  </div>

                  {authType === 'password' ? (
                    <div>
                      <label style={{ fontSize: '10px', color: ColorPalette.textMuted, display: 'block', marginBottom: '4px' }}>
                        Server Password (leave blank to prompt interactively)
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
                  ) : authType === 'fido2' ? (
                    <div>
                      <label style={{ fontSize: '10px', color: ColorPalette.textMuted, display: 'block', marginBottom: '4px' }}>
                        FIDO2 / Passkey Security Key Path
                      </label>
                      <input
                        type="text"
                        placeholder="~/.ssh/id_ed25519_sk or hardware token"
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
                              color: 'var(--theme-primary, #38bdf8)',
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
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                color: ColorPalette.textSecondary,
                fontSize: 'var(--btn-font-size, 12px)',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '7px 18px',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-primary, #38bdf8)',
                color: '#090b10',
                border: 'none',
                fontSize: 'var(--btn-font-size, 12px)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Create & Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
