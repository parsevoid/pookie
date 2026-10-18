import React, { useState } from 'react';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  ShieldCheck,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
} from 'lucide-react';
import type { AppStateContext } from '../../stores/appState';
import { type SSHKey, createSSHKey, type SSHKeyType } from '../../models/SSHKey';
import { ColorPalette } from '../../styles/theme';

interface SSHKeysViewProps {
  appState: AppStateContext;
}

interface GeneratedKeyResult {
  name: string;
  key_type: string;
  private_key_path: string;
  public_key_path: string;
  public_key_content: string;
  fingerprint: string;
  is_passkey: boolean;
}

export const SSHKeysView: React.FC<SSHKeysViewProps> = ({ appState }) => {
  const { sshKeys, setSshKeys } = appState;
  const palette = appState.settings?.customPalette;
  const primaryColor = palette?.primary || '#38bdf8';
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [keyFilter, setKeyFilter] = useState<'all' | 'passkeys' | 'standard'>('all');
  const [search, setSearch] = useState('');

  // Add existing key form state
  const [name, setName] = useState('');
  const [path, setPath] = useState('~/.ssh/id_ed25519');
  const [type, setType] = useState<SSHKeyType>('ED25519');

  // Generator form state
  const [genKeyName, setGenKeyName] = useState('');
  const [genKeyType, setGenKeyType] = useState<'ED25519-SK' | 'ECDSA-SK' | 'ED25519' | 'RSA'>('ED25519-SK');
  const [genComment, setGenComment] = useState('');
  const [genPassphrase, setGenPassphrase] = useState('');
  const [genResident, setGenResident] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedKeyResult | null>(null);
  const [copiedPubKey, setCopiedPubKey] = useState(false);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = (id: string) => {
    setSshKeys(sshKeys.filter((k) => k.id !== id));
  };

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const isPasskey = type.includes('SK') || type.includes('Passkey');
    const newKey: SSHKey = createSSHKey({
      id: `key-${Date.now()}`,
      name: name.trim(),
      privateKeyPath: path.trim(),
      path: path.trim(),
      keyType: type,
      type,
      isPasskey,
      fingerprint: `SHA256:${Math.random().toString(36).substring(2, 15)}...`,
      isDefault: sshKeys.length === 0,
    });

    setSshKeys([...sshKeys, newKey]);
    setShowAddModal(false);
    setName('');
    setPath('~/.ssh/id_ed25519');
    setType('ED25519');
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setGenError(null);
    setGeneratedResult(null);

    const isPasskey = genKeyType.includes('SK');

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<GeneratedKeyResult>('generate_ssh_key', {
        name: genKeyName.trim() || (isPasskey ? 'id_ed25519_sk' : 'id_ed25519'),
        keyType: genKeyType,
        path: null,
        passphrase: genPassphrase ? genPassphrase : null,
        comment: genComment ? genComment : null,
        resident: genResident,
      });

      const newKey: SSHKey = createSSHKey({
        id: `key-${Date.now()}`,
        name: result.name,
        privateKeyPath: result.private_key_path,
        publicKeyPath: result.public_key_path,
        publicKeyContent: result.public_key_content,
        keyType: result.key_type as SSHKeyType,
        type: result.key_type,
        fingerprint: result.fingerprint,
        isPasskey: result.is_passkey,
        isDefault: sshKeys.length === 0,
      });

      setSshKeys([...sshKeys, newKey]);
      setGeneratedResult(result);
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      setGenError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredKeys = sshKeys.filter((k) => {
    const isPass = k.isPasskey || k.keyType?.includes('SK') || k.type?.includes('SK') || k.keyType === 'FIDO2-Passkey';
    if (keyFilter === 'passkeys' && !isPass) return false;
    if (keyFilter === 'standard' && isPass) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = k.name.toLowerCase().includes(q);
      const matchPath = (k.path || k.privateKeyPath || '').toLowerCase().includes(q);
      const matchType = (k.type || k.keyType || '').toLowerCase().includes(q);
      return matchName || matchPath || matchType;
    }
    return true;
  });

  const passkeysCount = sshKeys.filter((k) => k.isPasskey || k.keyType?.includes('SK') || k.type?.includes('SK')).length;
  const standardCount = sshKeys.length - passkeysCount;

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
      {/* ─── Minimalist Clean Header ─── */}
      <div
        style={{
          padding: '16px 28px',
          borderBottom: `1px solid ${ColorPalette.separator}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: 'var(--font-size-xl, 15px)', fontWeight: 600, color: ColorPalette.textPrimary, letterSpacing: '-0.01em', fontFamily: 'var(--font-ui)', margin: 0 }}>
            SSH Keys
          </h1>
          <span
            style={{
              fontSize: 'var(--font-size-xs, 10px)',
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              color: ColorPalette.textMuted,
              padding: '1px 7px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
          >
            {sshKeys.length}
          </span>
        </div>

        {/* Minimalist Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: `1px solid ${ColorPalette.border}`,
              color: ColorPalette.textSecondary,
              fontSize: 'var(--btn-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = ColorPalette.separator;
              e.currentTarget.style.color = ColorPalette.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = ColorPalette.border;
              e.currentTarget.style.color = ColorPalette.textSecondary;
            }}
          >
            <span>Import Key</span>
          </button>

          <button
            onClick={() => {
              setGenError(null);
              setGeneratedResult(null);
              setShowGenerateModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              backgroundColor: primaryColor,
              border: 'none',
              color: '#090b10',
              fontSize: 'var(--btn-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Generate Key</span>
          </button>
        </div>
      </div>

      {/* ─── Minimalist Filter Bar (Tabs + Search) ─── */}
      <div
        style={{
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setKeyFilter('all')}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              fontSize: 'var(--tab-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: keyFilter === 'all' ? 600 : 400,
              backgroundColor: keyFilter === 'all' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: keyFilter === 'all' ? ColorPalette.textPrimary : ColorPalette.textMuted,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            All ({sshKeys.length})
          </button>

          <button
            onClick={() => setKeyFilter('passkeys')}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              fontSize: 'var(--tab-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: keyFilter === 'passkeys' ? 600 : 400,
              backgroundColor: keyFilter === 'passkeys' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: keyFilter === 'passkeys' ? ColorPalette.textPrimary : ColorPalette.textMuted,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            Passkeys ({passkeysCount})
          </button>

          <button
            onClick={() => setKeyFilter('standard')}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              fontSize: 'var(--tab-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              fontWeight: keyFilter === 'standard' ? 600 : 400,
              backgroundColor: keyFilter === 'standard' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: keyFilter === 'standard' ? ColorPalette.textPrimary : ColorPalette.textMuted,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            Standard ({standardCount})
          </button>
        </div>

        {/* Minimalist Search (only visible when there are keys or active search) */}
        {(sshKeys.length > 2 || search) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${ColorPalette.border}`,
              width: '180px',
            }}
          >
            <Search size={13} color={ColorPalette.textMuted} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter keys..."
              style={{
                background: 'transparent',
                border: 'none',
                color: ColorPalette.textPrimary,
                fontSize: 'var(--input-font-size, 12px)',
                fontFamily: 'var(--font-ui)',
                outline: 'none',
                width: '100%',
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
                  padding: 0,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Keys Content Area ─── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 28px 24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {filteredKeys.length === 0 ? (
          /* Minimalist Understated Empty State */
          <div
            style={{
              flex: 1,
              minHeight: '260px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '40px 20px',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${ColorPalette.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: ColorPalette.textMuted,
              }}
            >
              <Key size={18} strokeWidth={1.7} />
            </div>

            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: ColorPalette.textPrimary, margin: 0 }}>
                {search ? 'No matching keys found' : 'No SSH keys configured'}
              </p>
              <p style={{ fontSize: '12px', color: ColorPalette.textMuted, margin: '4px 0 0 0', maxWidth: '320px', lineHeight: 1.4 }}>
                {search
                  ? `No keys matched "${search}". Clear the filter to view all keys.`
                  : 'Generate a new keypair or import an existing private key to connect to hosts.'}
              </p>
            </div>

            {!search && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={() => {
                    setGenError(null);
                    setGeneratedResult(null);
                    setShowGenerateModal(true);
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = ColorPalette.separator)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = ColorPalette.border)}
                >
                  Generate Key
                </button>

                <button
                  onClick={() => setShowAddModal(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textSecondary,
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = ColorPalette.separator)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = ColorPalette.border)}
                >
                  Import Key
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredKeys.map((key) => {
            const keyDisplayPath = key.path || key.privateKeyPath;
            const keyDisplayType = key.type || key.keyType;
            const isPasskey = key.isPasskey || keyDisplayType.includes('SK') || keyDisplayType.includes('Passkey');
            const cleanType = isPasskey
              ? keyDisplayType.toLowerCase().replace('-sk', ' passkey')
              : keyDisplayType.toLowerCase();

            return (
              <div
                key={key.id}
                style={{
                  backgroundColor: ColorPalette.surfaceElevated,
                  borderRadius: '8px',
                  border: `1px solid ${ColorPalette.border}`,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  transition: 'border-color 0.12s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = ColorPalette.separator)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = ColorPalette.border)}
              >
                {/* Left: Icon & Details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isPasskey ? ColorPalette.accentCyan : ColorPalette.textSecondary,
                      flexShrink: 0,
                    }}
                  >
                    {isPasskey ? <ShieldCheck size={16} /> : <Key size={15} />}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: ColorPalette.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {key.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          fontFamily: 'monospace',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          color: isPasskey ? ColorPalette.accentCyan : ColorPalette.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        {cleanType}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: ColorPalette.textMuted,
                        marginTop: '3px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span>{keyDisplayPath}</span>
                      {key.fingerprint && (
                        <span style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {key.fingerprint.slice(0, 32)}…
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleCopy(key.id, key.publicKeyContent || key.fingerprint || keyDisplayPath)}
                    title="Copy Public Key"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 9px',
                      borderRadius: '5px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${ColorPalette.border}`,
                      color: copiedId === key.id ? ColorPalette.accentGreen : ColorPalette.textSecondary,
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = ColorPalette.textPrimary)}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = copiedId === key.id ? ColorPalette.accentGreen : ColorPalette.textSecondary)
                    }
                  >
                    {copiedId === key.id ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedId === key.id ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    title="Delete Key"
                    onClick={() => handleDelete(key.id)}
                    style={{
                      padding: '6px',
                      borderRadius: '5px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: ColorPalette.textMuted,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 0.12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = ColorPalette.accentRed)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = ColorPalette.textMuted)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Minimalist Modal: Generate Keypair / Passkey ─── */}
      {showGenerateModal && (
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
              maxWidth: '92vw',
              backgroundColor: '#141720',
              borderRadius: '10px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '20px 24px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: ColorPalette.textPrimary, margin: 0 }}>
                Generate SSH Key
              </h2>
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setGeneratedResult(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: ColorPalette.textMuted,
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                }}
              >
                <X size={15} />
              </button>
            </div>

            {generatedResult ? (
              /* Success View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(77, 204, 128, 0.1)',
                    border: '1px solid rgba(77, 204, 128, 0.25)',
                    color: ColorPalette.accentGreen,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>Key generated successfully</span>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: ColorPalette.textMuted, marginBottom: '4px', fontWeight: 500 }}>
                    Public Key
                  </div>
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textPrimary,
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      wordBreak: 'break-all',
                      maxHeight: '80px',
                      overflowY: 'auto',
                    }}
                  >
                    {generatedResult.public_key_content}
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: ColorPalette.textMuted, fontFamily: 'monospace' }}>
                  Path: {generatedResult.private_key_path}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedResult.public_key_content);
                      setCopiedPubKey(true);
                      setTimeout(() => setCopiedPubKey(false), 2000);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '5px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${ColorPalette.border}`,
                      color: copiedPubKey ? ColorPalette.accentGreen : ColorPalette.textPrimary,
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedPubKey ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedPubKey ? 'Copied' : 'Copy Public Key'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowGenerateModal(false);
                      setGeneratedResult(null);
                    }}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '5px',
                      backgroundColor: primaryColor,
                      border: 'none',
                      color: '#090b10',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Generator Form */
              <form onSubmit={handleGenerateKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {genError && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(230, 89, 102, 0.1)',
                      border: '1px solid rgba(230, 89, 102, 0.25)',
                      color: ColorPalette.accentRed,
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    <span>{genError}</span>
                  </div>
                )}

                {/* Key Type Selector */}
                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                    Type
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {[
                      { id: 'ED25519-SK', label: 'ED25519-SK', desc: 'FIDO2 Passkey / YubiKey' },
                      { id: 'ED25519', label: 'ED25519', desc: 'Standard (Recommended)' },
                      { id: 'ECDSA-SK', label: 'ECDSA-SK', desc: 'NIST P-256 Passkey' },
                      { id: 'RSA', label: 'RSA 4096', desc: 'Legacy Compatibility' },
                    ].map((item) => {
                      const selected = genKeyType === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setGenKeyType(item.id as any)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: selected ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.02)',
                            border: `1px solid ${selected ? primaryColor : ColorPalette.border}`,
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'all 0.12s ease',
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 600, color: ColorPalette.textPrimary }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: '10px', color: ColorPalette.textMuted, marginTop: '2px' }}>
                            {item.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                    Name / Identifier
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={genKeyType.includes('SK') ? 'e.g. Work YubiKey' : 'e.g. id_ed25519'}
                    value={genKeyName}
                    onChange={(e) => setGenKeyName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textPrimary,
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                    Comment / Label (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. user@myterminal"
                    value={genComment}
                    onChange={(e) => setGenComment(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textPrimary,
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                    Passphrase (optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave empty for passwordless"
                    value={genPassphrase}
                    onChange={(e) => setGenPassphrase(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textPrimary,
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>

                {genKeyType.includes('SK') && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: ColorPalette.textSecondary }}>
                    <input
                      type="checkbox"
                      checked={genResident}
                      onChange={(e) => setGenResident(e.target.checked)}
                      style={{ accentColor: primaryColor }}
                    />
                    <span>Store as Resident Key on hardware token</span>
                  </label>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setShowGenerateModal(false)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '5px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textSecondary,
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGenerating}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 16px',
                      borderRadius: '5px',
                      backgroundColor: primaryColor,
                      border: 'none',
                      color: '#090b10',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: isGenerating ? 'default' : 'pointer',
                      opacity: isGenerating ? 0.7 : 1,
                    }}
                  >
                    {isGenerating && <Loader2 size={13} className="animate-spin" />}
                    <span>{isGenerating ? 'Touch Security Key…' : 'Generate'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Minimalist Modal: Import Existing Key ─── */}
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
              width: '420px',
              maxWidth: '92vw',
              backgroundColor: '#141720',
              borderRadius: '10px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '20px 24px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: ColorPalette.textPrimary, margin: 0 }}>
                Import Existing SSH Key
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: ColorPalette.textMuted,
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleAddKey} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  Key Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Personal Laptop Key"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  Key Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SSHKeyType)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#1a1d26',
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                    outline: 'none',
                  }}
                >
                  <option value="ED25519">ED25519 (Recommended)</option>
                  <option value="ED25519-SK">FIDO2 Passkey (ED25519-SK)</option>
                  <option value="ECDSA-SK">FIDO2 Passkey (ECDSA-SK)</option>
                  <option value="RSA">RSA (4096-bit)</option>
                  <option value="ECDSA">ECDSA (P-256)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  File Path
                </label>
                <input
                  type="text"
                  required
                  placeholder="~/.ssh/id_ed25519"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '5px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textSecondary,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '6px 16px',
                    borderRadius: '5px',
                    backgroundColor: primaryColor,
                    border: 'none',
                    color: '#090b10',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
