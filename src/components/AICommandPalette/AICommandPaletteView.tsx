import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Terminal, Copy, Check, ShieldAlert, ShieldCheck, AlertTriangle, Brain, FileCode2 } from 'lucide-react';
import { generateWithRouting, generateWithModelAsync, getModelDisplayName } from '../../engine/KaliTerminusEngine';
import type { AICommandSuggestion } from '../../models/AISuggestion';
import type { Snippet } from '../../models/Snippet';
import { ColorPalette } from '../../styles/theme';

import type { AppSettings } from '../../stores/appState';

interface AICommandPaletteViewProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (command: string) => void;
  snippets?: Snippet[];
  settings?: AppSettings;
  targetEnv?: string;
}

export const AICommandPaletteView: React.FC<AICommandPaletteViewProps> = ({
  isOpen,
  onClose,
  onRunCommand,
  snippets = [],
  settings,
  targetEnv = 'local',
}) => {
  const [query, setQuery] = useState('');
  const [suggestion, setSuggestion] = useState<AICommandSuggestion | null>(null);
  const [copied, setCopied] = useState(false);
  const [_isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genIdRef = useRef<number>(0);

  const isReasoningMode = query.trim().startsWith('@');
  const isSnippetMode = query.trim().startsWith('#');

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSuggestion(null);
      setCopied(false);
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestion(null);
      setIsLoading(false);
      return;
    }

    // Snippets are instant (sync)
    if (query.trim().startsWith('#')) {
      const res = generateWithRouting(query, snippets, settings?.aiModel, settings?.aiModel);
      setSuggestion(res);
      setIsLoading(false);
      return;
    }

    // Everything else goes through the model (async with debounce)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const genId = ++genIdRef.current;
    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      generateWithModelAsync(
        query,
        snippets,
        settings?.reasoningModel || 'ternary-bonsai-27b',
        settings?.aiModel || 'ternary-bonsai-1.7b',
        targetEnv
      )
        .then((res) => {
          if (genIdRef.current !== genId) return;
          setSuggestion(res);
          setIsLoading(false);
        })
        .catch(() => {
          if (genIdRef.current === genId) {
            setSuggestion(null);
            setIsLoading(false);
          }
        });
    }, 350);
  }, [query, snippets, settings?.aiModel, settings?.reasoningModel, targetEnv]);

  if (!isOpen) return null;

  const getRiskLevel = (cmd: string): 'safe' | 'caution' | 'danger' => {
    const lower = cmd.toLowerCase();
    if (
      lower.includes('rm -rf') ||
      lower.includes('mkfs') ||
      lower.includes('fdisk') ||
      lower.includes('dd if=') ||
      lower.includes('reset --hard')
    ) {
      return 'danger';
    }
    if (
      lower.includes('kill') ||
      lower.includes('prune') ||
      lower.includes('shutdown') ||
      lower.includes('reboot') ||
      lower.includes('taskkill')
    ) {
      return 'caution';
    }
    return 'safe';
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRun = () => {
    if (suggestion) {
      onRunCommand(suggestion.command);
      onClose();
    }
  };

  const samplePrompts = [
    '@ edit this portal',
    'kill port 3000',
    '@ find files modified today',
    '# docker',
    'find files bigger than 100MB',
    '@ undo last commit keep changes',
    '# git',
    'check open listening ports',
  ];

  const risk = suggestion ? getRiskLevel(suggestion.command) : 'safe';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: '580px',
          maxWidth: '92vw',
          backgroundColor: '#161922',
          borderRadius: '14px',
          border: '1.5px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${ColorPalette.border}`,
            background: '#161922',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            {isReasoningMode ? (
              <>
                <Brain size={18} color="#38bdf8" />
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#38bdf8' }}>
                  {getModelDisplayName(settings?.reasoningModel || 'ternary-bonsai-27b')} (@ Reasoning)
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                >
                  Commands & # Comments Only
                </span>
              </>
            ) : isSnippetMode ? (
              <>
                <FileCode2 size={18} color="#f472b6" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#f472b6' }}>
                  Snippet System (#)
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#f472b6',
                    backgroundColor: 'rgba(236, 72, 153, 0.2)',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    border: '1px solid rgba(236, 72, 153, 0.35)',
                  }}
                >
                  Library Search
                </span>
              </>
            ) : (
              <>
                <Sparkles size={18} color="var(--theme-primary, #38bdf8)" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: ColorPalette.textPrimary }}>
                  {getModelDisplayName(settings?.aiModel || 'ternary-bonsai-1.7b')}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: ColorPalette.accentGreen,
                    backgroundColor: `${ColorPalette.accentGreen}18`,
                    padding: '2px 7px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: ColorPalette.accentGreen,
                    }}
                  />
                  Instant (&lt;1ms)
                </span>
              </>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              color: ColorPalette.textMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Input Field */}
        <div
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderBottom: `1px solid ${ColorPalette.border}`,
            backgroundColor: ColorPalette.surfaceElevated,
          }}
        >
          <Terminal size={17} color="var(--theme-primary, #38bdf8)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRun();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Describe what you want to do (e.g. 'kill port 3000', 'find files > 50MB')..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: ColorPalette.textPrimary,
              fontSize: '14px',
              fontWeight: 500,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ color: ColorPalette.textMuted, fontSize: '11px' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Body Area */}
        <div style={{ padding: '16px 18px', minHeight: '130px' }}>
          {suggestion ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Command Box */}
              <div
                style={{
                  backgroundColor: ColorPalette.background,
                  borderRadius: '8px',
                  border: `1px solid ${ColorPalette.border}`,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                  {suggestion.command.split('\n').map((line, idx) => {
                    const isComment = line.trim().startsWith('#');
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'pre' }}>
                        {!isComment && (
                          <span style={{ color: ColorPalette.terminalPromptUser, fontWeight: 700, fontSize: '11px' }}>
                            $
                          </span>
                        )}
                        <code
                          style={{
                            color: isComment ? '#7ee787' : ColorPalette.textPrimary,
                            fontSize: '12px',
                            fontStyle: isComment ? 'italic' : 'normal',
                            fontWeight: isComment ? 500 : 600,
                            overflowX: 'auto',
                          }}
                        >
                          {line}
                        </code>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => handleCopy(suggestion.command)}
                  title="Copy command"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 9px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceHover,
                    color: copied ? ColorPalette.accentGreen : ColorPalette.textSecondary,
                    fontSize: '11px',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Explanation & Risk */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <div style={{ color: ColorPalette.textSecondary, flex: 1 }}>
                  {suggestion.explanation}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor:
                      risk === 'danger'
                        ? `${ColorPalette.accentRed}22`
                        : risk === 'caution'
                        ? `${ColorPalette.accentYellow}22`
                        : `${ColorPalette.accentGreen}22`,
                    color:
                      risk === 'danger'
                        ? ColorPalette.accentRed
                        : risk === 'caution'
                        ? ColorPalette.accentYellow
                        : ColorPalette.accentGreen,
                  }}
                >
                  {risk === 'danger' ? (
                    <ShieldAlert size={13} />
                  ) : risk === 'caution' ? (
                    <AlertTriangle size={13} />
                  ) : (
                    <ShieldCheck size={13} />
                  )}
                  <span>
                    {risk === 'danger'
                      ? 'Destructive'
                      : risk === 'caution'
                      ? 'Caution'
                      : 'Safe to run'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', color: ColorPalette.textMuted, fontWeight: 600 }}>
                TRY ASKING FOR:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {samplePrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => setQuery(p)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      backgroundColor: ColorPalette.surfaceElevated,
                      border: `1px solid ${ColorPalette.border}`,
                      color: ColorPalette.textSecondary,
                      fontSize: '11px',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--theme-primary, #38bdf8)';
                      e.currentTarget.style.color = ColorPalette.textPrimary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = ColorPalette.border;
                      e.currentTarget.style.color = ColorPalette.textSecondary;
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: `1px solid ${ColorPalette.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: ColorPalette.sidebarBackground,
          }}
        >
          <div style={{ fontSize: '11px', color: ColorPalette.textMuted }}>
            Press <kbd style={{ padding: '2px 5px', borderRadius: '4px', backgroundColor: ColorPalette.surfaceHover }}>↵ Enter</kbd> to execute in terminal
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                color: ColorPalette.textSecondary,
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleRun}
              disabled={!suggestion}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                backgroundColor: suggestion
                  ? 'var(--theme-primary, #6366f1)'
                  : ColorPalette.surfaceHover,
                color: suggestion ? '#ffffff' : ColorPalette.textMuted,
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: suggestion ? 'pointer' : 'not-allowed',
                border: 'none',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (suggestion) e.currentTarget.style.opacity = '0.88';
              }}
              onMouseLeave={(e) => {
                if (suggestion) e.currentTarget.style.opacity = '1';
              }}
            >
              <Terminal size={14} />
              <span>Run in Terminal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
