import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Terminal,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  X,
  Brain,
  FileCode2,

} from 'lucide-react';
import { generateWithRouting, generateWithModelAsync, getModelDisplayName } from '../../engine/KaliTerminusEngine';
import type { AICommandSuggestion } from '../../models/AISuggestion';
import type { Snippet } from '../../models/Snippet';
import type { AppSettings } from '../../stores/appState';
import { ColorPalette } from '../../styles/theme';

interface BottomAssistantBarProps {
  onRunCommand: (command: string) => void;
  onOpenFullPalette?: () => void;
  onOpenModelManager?: () => void;
  snippets?: Snippet[];
  settings?: AppSettings;
  targetEnv?: string;
}

export const BottomAssistantBar: React.FC<BottomAssistantBarProps> = ({
  onRunCommand,
  onOpenModelManager,
  snippets = [],
  settings,
  targetEnv = 'local',
}) => {
  const [prompt, setPrompt] = useState('');
  const [suggestion, setSuggestion] = useState<AICommandSuggestion | null>(null);
  const [copied, setCopied] = useState(false);
  const [_isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genIdRef = useRef<number>(0);

  const isReasoningMode = prompt.trim().startsWith('@');
  const isSnippetMode = prompt.trim().startsWith('#');

  useEffect(() => {
    if (!prompt.trim()) {
      setSuggestion(null);
      setIsLoading(false);
      return;
    }

    // Snippets are instant (sync)
    if (prompt.trim().startsWith('#')) {
      const res = generateWithRouting(prompt, snippets, settings?.aiModel, settings?.aiModel);
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
        prompt,
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
  }, [prompt, snippets, settings?.aiModel, settings?.reasoningModel, targetEnv]);

  const getDisplayModelName = () => {
    return getModelDisplayName(settings?.aiModel || 'ternary-bonsai-1.7b');
  };

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

  const handleRun = () => {
    if (suggestion) {
      onRunCommand(suggestion.command);
      setPrompt('');
      setSuggestion(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const risk = suggestion ? getRiskLevel(suggestion.command) : 'safe';

  // Render multi-line command with syntax-highlighted comments (# ...)
  const renderHighlightedCommand = (rawCmd: string) => {
    const lines = rawCmd.split('\n');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowX: 'auto' }}>
        {lines.map((line, idx) => {
          const isComment = line.trim().startsWith('#');
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'pre' }}>
              {!isComment && (
                <span style={{ color: ColorPalette.terminalPromptUser, fontSize: '11px', fontWeight: 700 }}>
                  $
                </span>
              )}
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: isComment ? '#7ee787' : ColorPalette.textPrimary,
                  fontStyle: isComment ? 'italic' : 'normal',
                  fontWeight: isComment ? 500 : 600,
                  opacity: isComment ? 0.9 : 1,
                }}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${ColorPalette.border}`,
        backgroundColor: '#161922',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        transition: 'all 0.2s ease',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
        zIndex: 10,
      }}
    >
      {/* Live Suggestion preview popup when typing */}
      {suggestion && (
        <div
          className="animate-fade-in"
          style={{
            padding: '10px 16px',
            backgroundColor: ColorPalette.background,
            borderBottom: `1px solid ${ColorPalette.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
            {/* Top status line: Model & Risk badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isReasoningMode ? (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: 'var(--btn-secondary-bg, rgba(56, 189, 248, 0.15))',
                    color: 'var(--theme-primary, #38bdf8)',
                    border: '1px solid var(--btn-secondary-border, rgba(56, 189, 248, 0.35))',
                  }}
                >
                  <Brain size={11} />
                  REASONING MODEL (@) — COMMANDS ONLY
                </span>
              ) : isSnippetMode ? (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: 'rgba(236, 72, 153, 0.18)',
                    color: '#f472b6',
                    border: '1px solid rgba(236, 72, 153, 0.35)',
                  }}
                >
                  <FileCode2 size={11} />
                  SNIPPET SYSTEM (#)
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    backgroundColor: `${ColorPalette.accentCyan}20`,
                    color: ColorPalette.accentCyan,
                  }}
                >
                  <Sparkles size={10} />
                  Kali-Terminus-v2 (350M)
                </span>
              )}

              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
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
                {risk === 'danger' ? <ShieldAlert size={10} /> : risk === 'caution' ? <AlertTriangle size={10} /> : <ShieldCheck size={10} />}
                {risk.toUpperCase()}
              </span>

              <span style={{ fontSize: '11px', color: ColorPalette.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                — {suggestion.explanation}
              </span>
            </div>

            {/* Formatted Command Output with # Comments */}
            <div
              style={{
                backgroundColor: '#11131a',
                padding: '8px 12px',
                borderRadius: '6px',
                border: `1px solid ${ColorPalette.border}`,
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            >
              {renderHighlightedCommand(suggestion.command)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <button
              onClick={() => handleCopy(suggestion.command)}
              title="Copy command"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 9px',
                borderRadius: '5px',
                backgroundColor: ColorPalette.surfaceHover,
                color: copied ? ColorPalette.accentGreen : ColorPalette.textSecondary,
                fontSize: '11px',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleRun}
              title="Run in active terminal (Enter)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 14px',
                borderRadius: '5px',
                background: isReasoningMode
                  ? '#0284c7'
                  : isSnippetMode
                  ? '#db2777'
                  : '#2563eb',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
              }}
            >
              <Terminal size={12} />
              <span>Run (↵)</span>
            </button>
          </div>
        </div>
      )}

      {/* Main bottom input bar */}
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        {/* Dynamic Mode Badge */}
        {isReasoningMode ? (
          <div
            onClick={onOpenModelManager}
            title="Click to open Model Manager in Settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(14, 165, 233, 0.12)',
              border: '1px solid rgba(14, 165, 233, 0.32)',
              color: '#38bdf8',
              fontSize: '11px',
              fontWeight: 600,
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.2)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.12)')}
          >
            <Brain size={13} color="#38bdf8" />
            <span>{getDisplayModelName()}</span>
          </div>
        ) : isSnippetMode ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(236, 72, 153, 0.12)',
              border: '1px solid rgba(236, 72, 153, 0.3)',
              color: '#f472b6',
              fontSize: '11px',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <FileCode2 size={13} color="#f472b6" />
            <span>Snippet Mode (#)</span>
          </div>
        ) : (
          <div
            onClick={onOpenModelManager}
            title="Click to open Model Manager in Settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              color: '#34d399',
              fontSize: '11px',
              fontWeight: 600,
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)')}
          >
            <Sparkles size={13} color="#34d399" />
            <span>{getDisplayModelName()}</span>
          </div>
        )}

        {/* Prompt Input */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: ColorPalette.surfaceElevated,
            borderRadius: '6px',
            border: isReasoningMode
              ? '1px solid #0284c7'
              : isSnippetMode
              ? '1px solid #ec4899'
              : `1px solid ${ColorPalette.border}`,
            padding: '5px 10px',
            gap: '8px',
            transition: 'border-color 0.15s ease',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRun();
              } else if (e.key === 'Escape') {
                setPrompt('');
                setSuggestion(null);
              }
            }}
            placeholder={
              isReasoningMode
                ? "Type question or task (e.g. '@ edit this portal', '@ find large files')... Outputs commands with # comments"
                : isSnippetMode
                ? "Search snippet library (e.g. '# docker', '# git undo')... Press ↵ to run"
                : "Type command, prompt, '@' question (reasoning), or '#' (snippet)... Press ↵ to run"
            }
            style={{
              background: 'transparent',
              border: 'none',
              color: ColorPalette.textPrimary,
              fontSize: '12px',
              flex: 1,
            }}
          />
          {prompt && (
            <button
              onClick={() => {
                setPrompt('');
                setSuggestion(null);
              }}
              style={{ color: ColorPalette.textMuted }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

