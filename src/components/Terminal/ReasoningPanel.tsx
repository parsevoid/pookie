import React, { useState } from 'react';
import { Brain, Play, SkipForward, X, Copy, Check, Loader2 } from 'lucide-react';
import { ColorPalette } from '../../styles/theme';

export interface ActiveReasoningState {
  query: string;
  model: string;
  isLoading: boolean;
  infoLines: string[];
  commands: string[];
  currentIndex: number;
}

interface ReasoningPanelProps {
  reasoning: ActiveReasoningState;
  onRunCurrent: () => void;
  onSkipCurrent: () => void;
  onClose: () => void;
  fontFamily?: string;
  fontSize?: number;
}

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
  reasoning,
  onRunCurrent,
  onSkipCurrent,
  onClose,
  fontFamily = 'SF Mono, Menlo, monospace',
  fontSize = 12,
}) => {
  const [copied, setCopied] = useState(false);

  const currentCmd =
    reasoning.commands && reasoning.commands.length > reasoning.currentIndex
      ? reasoning.commands[reasoning.currentIndex]
      : '';
  const totalCommands = reasoning.commands ? reasoning.commands.length : 0;
  const hasCommands = totalCommands > 0 && currentCmd;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        borderTop: '1px solid #2a2e3d',
        backgroundColor: '#12151e',
        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '260px',
        minHeight: '110px',
        zIndex: 25,
        userSelect: 'text',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          backgroundColor: '#161924',
          borderBottom: '1px solid #232736',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Brain size={14} color="#38bdf8" />
          <span style={{ fontWeight: 600, color: ColorPalette.textPrimary, letterSpacing: '0.2px' }}>
            Reasoning & Plan
          </span>
          <span
            style={{
              color: '#94a3b8',
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              maxWidth: '240px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            "{reasoning.query}"
          </span>
          <span
            style={{
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 500,
            }}
          >
            {reasoning.model}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#64748b', fontSize: '10px' }}>
            {hasCommands ? 'Press [y / Enter] to run, [n] to skip, [Esc] to close' : 'Press [Esc] to close'}
          </span>
          <button
            onClick={onClose}
            title="Close reasoning panel (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content body */}
      <div
        style={{
          padding: '10px 14px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flex: 1,
        }}
      >
        {reasoning.isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '16px 0',
              color: '#94a3b8',
              fontSize: '12px',
            }}
          >
            <Loader2 size={16} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
            <span>Thinking, analyzing query and planning solution...</span>
          </div>
        ) : (
          <>
            {/* Reasoning / Explanation block */}
            {reasoning.infoLines && reasoning.infoLines.length > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderLeft: '3px solid #38bdf8',
                  borderRadius: '2px 6px 6px 2px',
                  padding: '6px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {hasCommands ? 'Thought Process & Plan' : 'Response'}
                </div>
                {reasoning.infoLines.map((line, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: '12px',
                      lineHeight: '1.4',
                      color: '#cbd5e1',
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Command execution section */}
            {hasCommands ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: '#0c0e15',
                  border: '1px solid #232738',
                  borderRadius: '6px',
                  padding: '6px 10px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
                      ⚡ Execute [{reasoning.currentIndex + 1}/{totalCommands}]:
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily,
                      fontSize: `${fontSize}px`,
                      color: '#4ade80',
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {currentCmd}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleCopy(currentCmd)}
                    title="Copy command"
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid #2a2e3d',
                      borderRadius: '4px',
                      color: '#94a3b8',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  {totalCommands > 1 && reasoning.currentIndex + 1 < totalCommands && (
                    <button
                      onClick={onSkipCurrent}
                      title="Skip this command (n)"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid #2a2e3d',
                        borderRadius: '4px',
                        color: '#94a3b8',
                        padding: '4px 10px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <SkipForward size={12} />
                      <span>Skip (n)</span>
                    </button>
                  )}

                  <button
                    onClick={onRunCurrent}
                    title="Run command in terminal (Enter or y)"
                    style={{
                      background: '#059669',
                      border: '1px solid #10b981',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)',
                    }}
                  >
                    <Play size={11} fill="#ffffff" />
                    <span>Run (Enter)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '2px' }}>
                <button
                  onClick={onClose}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid #2a2e3d',
                    borderRadius: '4px',
                    color: '#cbd5e1',
                    padding: '3px 12px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss (Esc)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
