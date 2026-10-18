import React, { useState, useEffect, useRef } from 'react';
import { FileCode2, X, Terminal, Copy, Check } from 'lucide-react';
import type { Snippet } from '../../models/Snippet';
import { ColorPalette } from '../../styles/theme';

interface SnippetCommandPaletteViewProps {
  isOpen: boolean;
  onClose: () => void;
  snippets: Snippet[];
  onRunSnippet: (command: string) => void;
}

export const SnippetCommandPaletteView: React.FC<SnippetCommandPaletteViewProps> = ({
  isOpen,
  onClose,
  snippets,
  onRunSnippet,
}) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = snippets.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.toLowerCase().includes(search.toLowerCase()) ||
      s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
      (s.category && s.category.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleRun = (cmd: string) => {
    onRunSnippet(cmd);
    onClose();
  };

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
          border: `1px solid ${ColorPalette.border}`,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '70vh',
        }}
      >
        {/* Search header */}
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
          <FileCode2 size={18} color="var(--theme-primary, #38bdf8)" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[selectedIndex]) {
                  handleRun(filtered[selectedIndex].content);
                }
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search snippets by name, command, or tag..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: ColorPalette.textPrimary,
              fontSize: '14px',
            }}
          />
          <button onClick={onClose} style={{ color: ColorPalette.textMuted }}>
            <X size={16} />
          </button>
        </div>

        {/* Snippet list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: ColorPalette.textMuted, fontSize: '13px' }}>
              No snippets matching "{search}"
            </div>
          ) : (
            filtered.map((snip, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={snip.id}
                  onClick={() => handleRun(snip.content)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? ColorPalette.surfaceHover : 'transparent',
                    border: isSelected ? '1px solid var(--theme-primary, #38bdf8)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 0.1s ease',
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: ColorPalette.textPrimary }}>
                      {snip.title}
                    </span>
                    {snip.category && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--theme-primary, #38bdf8)',
                          backgroundColor: 'var(--btn-secondary-bg, rgba(56, 189, 248, 0.15))',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        {snip.category}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <code
                      style={{
                        fontSize: '11px',
                        color: 'var(--theme-primary, #38bdf8)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      $ {snip.content}
                    </code>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        title="Copy command"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(snip.id, snip.content);
                        }}
                        style={{
                          padding: '3px 6px',
                          borderRadius: '4px',
                          color: copiedId === snip.id ? ColorPalette.accentGreen : ColorPalette.textMuted,
                        }}
                      >
                        {copiedId === snip.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      <button
                        title="Run in terminal"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRun(snip.content);
                        }}
                        style={{
                          padding: '3px 6px',
                          borderRadius: '4px',
                          color: 'var(--theme-primary, #38bdf8)',
                        }}
                      >
                        <Terminal size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
