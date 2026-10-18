import React, { useState } from 'react';
import { Plus, Terminal, Copy, Check, Search, Tag, X, Trash2 } from 'lucide-react';
import type { AppStateContext } from '../../stores/appState';
import { type Snippet, createSnippet } from '../../models/Snippet';
import { ColorPalette } from '../../styles/theme';

interface SnippetsViewProps {
  appState: AppStateContext;
}

export const SnippetsView: React.FC<SnippetsViewProps> = ({ appState }) => {
  const { snippets, setSnippets, runCommandInTerminal } = appState;
  const palette = appState.settings?.customPalette;
  const primaryColor = palette?.primary || '#38bdf8';
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // New snippet form state
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Linux');
  const [tags, setTags] = useState('');

  const categories = ['All', 'Docker', 'Git', 'Linux', 'DevOps', 'Network'];

  const filtered = snippets.filter((s) => {
    const matchesCat = activeCategory === 'All' || s.category === activeCategory;
    const matchesSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.toLowerCase().includes(search.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase())) ||
      s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleRun = (cmd: string) => {
    runCommandInTerminal(cmd);
  };

  const handleDelete = (id: string) => {
    setSnippets(snippets.filter((s) => s.id !== id));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !command.trim()) return;

    const newSnippet: Snippet = createSnippet({
      id: `snip-${Date.now()}`,
      title: title.trim(),
      content: command.trim(),
      description: description.trim() || undefined,
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

    setSnippets([newSnippet, ...snippets]);
    setShowAddModal(false);
    setTitle('');
    setCommand('');
    setDescription('');
    setCategory('Linux');
    setTags('');
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
          padding: '18px 24px',
          borderBottom: `1px solid ${ColorPalette.separator}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl, 15px)', fontWeight: 600, color: ColorPalette.textPrimary, fontFamily: 'var(--font-ui)', margin: 0 }}>
            Snippet Command Library
          </h1>
          <p style={{ fontSize: 'var(--font-size-base, 12px)', color: ColorPalette.textSecondary, fontFamily: 'var(--font-ui)', margin: '2px 0 0 0' }}>
            Save, organize, and execute reusable terminal workflows with one click.
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
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={15} />
          <span>New Snippet</span>
        </button>
      </div>

      {/* Filter & Category Toolbar */}
      <div
        style={{
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          borderBottom: `1px solid ${ColorPalette.border}`,
          fontFamily: 'var(--font-ui)',
        }}
      >
        {/* Categories */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: 'var(--tab-font-size, 12px)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? `${primaryColor}18` : 'transparent',
                  color: isActive ? primaryColor : ColorPalette.textSecondary,
                  border: isActive ? `1px solid ${primaryColor}44` : '1px solid transparent',
                  transition: 'all 0.12s ease',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            backgroundColor: ColorPalette.surfaceElevated,
            border: `1px solid ${ColorPalette.border}`,
            width: '240px',
          }}
        >
          <Search size={14} color={ColorPalette.textMuted} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippets..."
            style={{
              background: 'transparent',
              border: 'none',
              color: ColorPalette.textPrimary,
              fontSize: 'var(--input-font-size, 12px)',
              fontFamily: 'var(--font-ui)',
              outline: 'none',
              width: '100%',
              flex: 1,
            }}
          />
        </div>
      </div>

      {/* Snippet Cards */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {filtered.map((snip) => (
          <div
            key={snip.id}
            style={{
              backgroundColor: ColorPalette.surfaceElevated,
              borderRadius: '10px',
              border: `1px solid ${ColorPalette.border}`,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: ColorPalette.textPrimary }}>
                  {snip.title}
                </span>
                {snip.category && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: `${primaryColor}18`,
                      color: primaryColor,
                      border: `1px solid ${primaryColor}33`,
                      fontWeight: 600,
                    }}
                  >
                    {snip.category}
                  </span>
                )}
              </div>

              <button
                title="Delete"
                onClick={() => handleDelete(snip.id)}
                style={{ color: ColorPalette.textMuted, padding: '3px' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = ColorPalette.accentRed)}
                onMouseLeave={(e) => (e.currentTarget.style.color = ColorPalette.textMuted)}
              >
                <Trash2 size={13} />
              </button>
            </div>

            {snip.description && (
              <div style={{ fontSize: '12px', color: ColorPalette.textSecondary }}>
                {snip.description}
              </div>
            )}

            {/* Command block */}
            <div
              style={{
                backgroundColor: ColorPalette.background,
                borderRadius: '6px',
                border: `1px solid ${ColorPalette.border}`,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <code
                style={{
                  fontSize: '12px',
                  color: primaryColor,
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                $ {snip.content}
              </code>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => handleCopy(snip.id, snip.content)}
                  title="Copy command to clipboard"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${ColorPalette.border}`,
                    color: copiedId === snip.id ? ColorPalette.accentGreen : ColorPalette.textSecondary,
                    fontSize: 'var(--font-size-sm, 11px)',
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = ColorPalette.surfaceHover;
                    e.currentTarget.style.borderColor = ColorPalette.separator;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = ColorPalette.border;
                  }}
                >
                  {copiedId === snip.id ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedId === snip.id ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => handleRun(snip.content)}
                  title="Run in active terminal"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '5px',
                    backgroundColor: primaryColor,
                    border: 'none',
                    color: '#090b10',
                    fontSize: 'var(--font-size-sm, 11px)',
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <Terminal size={12} />
                  <span>Run</span>
                </button>
              </div>
            </div>

            {snip.tags && snip.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {snip.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      backgroundColor: ColorPalette.surfaceHover,
                      color: ColorPalette.textMuted,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <Tag size={8} />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Modal */}
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
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: ColorPalette.textPrimary }}>Create New Snippet</h2>
              <button onClick={() => setShowAddModal(false)} style={{ color: ColorPalette.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Restart Docker Swarm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                  Shell Command
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="docker stack deploy -c docker-compose.yml myapp"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: ColorPalette.surfaceElevated,
                    border: `1px solid ${ColorPalette.border}`,
                    color: ColorPalette.textPrimary,
                    fontSize: '12px',
                  }}
                >
                  <option value="Linux">Linux</option>
                  <option value="Docker">Docker</option>
                  <option value="Git">Git</option>
                  <option value="DevOps">DevOps</option>
                  <option value="Network">Network</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: ColorPalette.textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Description (optional)
                </label>
                <input
                  type="text"
                  placeholder="Brief note on what this command does"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="docker, deploy, swarm"
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px', fontFamily: 'var(--font-ui)' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
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
                    padding: '7px 16px',
                    borderRadius: '6px',
                    backgroundColor: primaryColor,
                    color: '#090b10',
                    fontSize: 'var(--btn-font-size, 12px)',
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  Save Snippet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
