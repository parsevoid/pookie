import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Check,
  ExternalLink,
  RefreshCw,
  Play,
  Copy,
  Trash2,
  Sparkles,
  Brain,
  Star,
} from 'lucide-react';
import type { AppSettings } from '../../stores/appState';
import modelRegistryData from '../../models/model_registry.json';
import { generateReasoningAsync } from '../../engine/KaliTerminusEngine';
import type { AICommandSuggestion } from '../../models/AISuggestion';

export interface ModelItem {
  id: string;
  name: string;
  category: string;
  provider: string;
  description: string;
  hf_repo: string;
  hf_url: string;
  filename: string;
  size_bytes: number;
  download_url: string;
  ram_required_mb: number;
  is_default?: boolean;
  is_recommended_suggestion?: boolean;
  is_recommended_reasoning?: boolean;
  tags: string[];
}

interface ModelManagerContentProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  isEmbedded?: boolean;
}

export const ModelManagerContent: React.FC<ModelManagerContentProps> = ({
  settings,
  onUpdateSettings,
  isEmbedded = false,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'suggestion' | 'reasoning'>('all');
  const [downloadingMap, setDownloadingMap] = useState<Record<string, number>>({});
  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<string | null>(null);

  // Live Reasoning Playground State
  const [testQuery, setTestQuery] = useState<string>('@ find 5 largest files in workspace');
  const [testResult, setTestResult] = useState<AICommandSuggestion | null>(null);
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [copiedTest, setCopiedTest] = useState(false);

  const models: ModelItem[] = modelRegistryData.models as ModelItem[];

  const activeSuggestionId = settings.aiModel || 'ternary-bonsai-1.7b';
  const activeReasoningId = settings.reasoningModel || 'ternary-bonsai-27b';

  const showToast = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── Automatic Sync with Native Disk State ──
  const syncDownloadedModels = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const downloadedIds = (await invoke('get_downloaded_models')) as string[];
      if (Array.isArray(downloadedIds)) {
        const map: Record<string, boolean> = {};
        for (const id of downloadedIds) {
          map[id] = true;
        }
        setDownloadedModels(map);
        localStorage.setItem('myterminal_downloaded_models', JSON.stringify(map));
      }
    } catch {
      // Fallback in browser preview
      try {
        const saved = localStorage.getItem('myterminal_downloaded_models');
        if (saved) setDownloadedModels(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    // Initial sync
    syncDownloadedModels();

    let unlistenProgress: (() => void) | null = null;
    let unlistenChanged: (() => void) | null = null;

    // Listen to native events from Rust backend
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        unlistenProgress = await listen<{
          model_id?: string;
          model_name: string;
          bytes_downloaded: number;
          total_bytes: number;
          percentage: number;
        }>('model-download-progress', (event) => {
          const targetId =
            event.payload.model_id ||
            models.find((m) => m.filename.toLowerCase() === event.payload.model_name.toLowerCase())?.id;
          if (targetId) {
            setDownloadingMap((prev) => ({
              ...prev,
              [targetId]: Math.min(100, Math.max(1, Math.round(event.payload.percentage))),
            }));
          }
        });

        // Backend notifies whenever models are added or deleted
        unlistenChanged = await listen('models-changed', () => {
          syncDownloadedModels();
        });
      } catch {}
    })();

    // Polling interval (every 3s while manager is open) to guarantee sync
    const pollTimer = setInterval(() => {
      syncDownloadedModels();
    }, 3000);

    const handleFocus = () => syncDownloadedModels();
    window.addEventListener('focus', handleFocus);

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenChanged) unlistenChanged();
      clearInterval(pollTimer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncDownloadedModels, models]);

  const handleSelectSuggestionModel = (modelId: string) => {
    const targetModel = models.find((m) => m.id === modelId);
    const updated = {
      ...settings,
      aiModel: modelId,
    };
    onUpdateSettings(updated);
    showToast(`${targetModel?.name || modelId} set for Auto-Suggestion`);
  };

  const handleSelectReasoningModel = (modelId: string) => {
    const targetModel = models.find((m) => m.id === modelId);
    const updated = {
      ...settings,
      reasoningModel: modelId,
    };
    onUpdateSettings(updated);
    showToast(`${targetModel?.name || modelId} set for Reasoning (@)`);
  };

  const handleDownload = async (model: ModelItem) => {
    setDownloadingMap((prev) => ({ ...prev, [model.id]: 2 }));

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_model', { modelId: model.id });
      setDownloadingMap((prev) => ({ ...prev, [model.id]: 100 }));
      await syncDownloadedModels();
      showToast(`${model.name} downloaded successfully!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Model download error:', err);
      showToast(`Download failed: ${msg.slice(0, 100)}`);
    } finally {
      setDownloadingMap((prev) => {
        const copy = { ...prev };
        delete copy[model.id];
        return copy;
      });
    }
  };

  const handleDeleteModel = async (model: ModelItem) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_model', { modelId: model.id });
      await syncDownloadedModels();

      const updatedSettings = { ...settings };
      let changed = false;

      const remainingDownloadedIds = Object.keys(downloadedModels).filter(
        (id) => id !== model.id && downloadedModels[id]
      );

      if (settings.aiModel === model.id) {
        updatedSettings.aiModel = remainingDownloadedIds[0] || 'ternary-bonsai-1.7b';
        changed = true;
      }
      if (settings.reasoningModel === model.id) {
        updatedSettings.reasoningModel = remainingDownloadedIds[0] || 'ternary-bonsai-27b';
        changed = true;
      }

      if (changed) {
        onUpdateSettings(updatedSettings);
      }

      showToast(`${model.name} deleted from disk`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Delete failed: ${msg.slice(0, 80)}`);
    }
  };

  const runTestInference = async () => {
    const q = testQuery.trim();
    if (!q) return;

    const queryClean = q.startsWith('@') ? q.slice(1).trim() : q;
    setIsTestLoading(true);
    setTestResult(null);
    try {
      const res = await generateReasoningAsync(queryClean, settings.reasoningModel || 'ternary-bonsai-27b');
      setTestResult(res);
    } catch {
      setTestResult(null);
    }
    setIsTestLoading(false);
  };

  const copyTestCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedTest(true);
    setTimeout(() => setCopiedTest(false), 1500);
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  const downloadedCount = models.filter((m) => !!downloadedModels[m.id]).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        color: '#f8fafc',
        height: '100%',
        fontFamily: 'inherit',
      }}
    >
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            padding: '7px 12px',
            borderRadius: '6px',
            backgroundColor: '#1e2433',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#e2e8f0',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check size={13} style={{ color: '#22c55e' }} />
          <span>{notification}</span>
        </div>
      )}

      {/* Dual Active Model Selector Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '10px',
        }}
      >
        {/* 1. Auto-Suggestion Model Selector */}
        <div
          style={{
            padding: '10px 12px',
            backgroundColor: 'rgba(56, 189, 248, 0.04)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="#38bdf8" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Auto-Suggestion Model
              </span>
            </div>
            {activeSuggestionId === 'ternary-bonsai-1.7b' && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(56, 189, 248, 0.18)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Star size={9} fill="#38bdf8" /> RECOMMENDED
              </span>
            )}
          </div>

          <div>
            <select
              value={activeSuggestionId}
              onChange={(e) => handleSelectSuggestionModel(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: '5px',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {models.map((m) => {
                const isRec = m.id === 'ternary-bonsai-1.7b';
                return (
                  <option key={`sug-${m.id}`} value={m.id}>
                    {m.name} {isRec ? '★ [Recommended]' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: '#94a3b8' }}>Real-time Tab Keystroke Suggestions</span>
            {downloadedModels[activeSuggestionId] ? (
              <span style={{ color: '#22c55e', fontWeight: 600 }}>● Ready</span>
            ) : (
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>● Not Downloaded</span>
            )}
          </div>
        </div>

        {/* 2. Reasoning Model Selector */}
        <div
          style={{
            padding: '10px 12px',
            backgroundColor: 'rgba(168, 85, 247, 0.04)',
            border: '1px solid rgba(168, 85, 247, 0.22)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Brain size={14} color="#c084fc" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Reasoning Model (@)
              </span>
            </div>
            {activeReasoningId === 'ternary-bonsai-27b' && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(192, 132, 252, 0.18)',
                  color: '#c084fc',
                  border: '1px solid rgba(192, 132, 252, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Star size={9} fill="#c084fc" /> RECOMMENDED
              </span>
            )}
          </div>

          <div>
            <select
              value={activeReasoningId}
              onChange={(e) => handleSelectReasoningModel(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: '5px',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {models.map((m) => {
                const isRec = m.id === 'ternary-bonsai-27b';
                return (
                  <option key={`reas-${m.id}`} value={m.id}>
                    {m.name} {isRec ? '★ [Recommended]' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: '#94a3b8' }}>Multi-Step &quot;@ query&quot; Command Planning</span>
            {downloadedModels[activeReasoningId] ? (
              <span style={{ color: '#22c55e', fontWeight: 600 }}>● Ready</span>
            ) : (
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>● Not Downloaded</span>
            )}
          </div>
        </div>
      </div>

      {/* Header & Filter Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>Available Models (9)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
            }}
          >
            {downloadedCount} of {models.length} downloaded
          </span>
        </div>

        {/* Filter Tabs */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            padding: '2px',
            borderRadius: '6px',
            gap: '2px',
          }}
        >
          {(['all', 'suggestion', 'reasoning'] as const).map((filter) => {
            const isActive = activeFilter === filter;
            const label =
              filter === 'all'
                ? 'All Models'
                : filter === 'suggestion'
                ? 'Auto-Suggestion'
                : 'Reasoning (@)';
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model List Cards */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          overflowY: 'auto',
          maxHeight: isEmbedded ? '310px' : '440px',
          paddingRight: '2px',
        }}
      >
        {models.map((model) => {
          const isDownloaded = !!downloadedModels[model.id];
          const isDownloading = downloadingMap[model.id] !== undefined;
          const currentProgress = downloadingMap[model.id] || 0;
          const isSuggestionActive = activeSuggestionId === model.id;
          const isReasoningActive = activeReasoningId === model.id;
          const isBonsaiSuggestionRec = model.id === 'ternary-bonsai-1.7b';
          const isBonsaiReasoningRec = model.id === 'ternary-bonsai-27b';

          return (
            <div
              key={model.id}
              style={{
                backgroundColor: isSuggestionActive || isReasoningActive ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                border: isSuggestionActive || isReasoningActive
                  ? '1px solid rgba(56, 189, 248, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'border-color 0.12s ease, background-color 0.12s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                {/* Left info column */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: isDownloaded ? '#22c55e' : isDownloading ? '#38bdf8' : '#475569',
                      flexShrink: 0,
                    }}
                    title={isDownloaded ? 'Downloaded and ready' : isDownloading ? 'Downloading' : 'Not downloaded'}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                        {model.name}
                      </span>

                      {/* Recommended Badges */}
                      {isBonsaiSuggestionRec && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(56, 189, 248, 0.18)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Star size={9} fill="#38bdf8" /> Recommended for Auto-Suggestion
                        </span>
                      )}

                      {isBonsaiReasoningRec && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(192, 132, 252, 0.18)',
                            color: '#c084fc',
                            border: '1px solid rgba(192, 132, 252, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Star size={9} fill="#c084fc" /> Recommended for Reasoning
                        </span>
                      )}

                      {/* Active Indicators */}
                      {isSuggestionActive && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                          }}
                        >
                          ⚡ Suggestion Active
                        </span>
                      )}

                      {isReasoningActive && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(192, 132, 252, 0.12)',
                            color: '#c084fc',
                            border: '1px solid rgba(192, 132, 252, 0.25)',
                          }}
                        >
                          🧠 Reasoning Active
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '8px' }}>
                      <span>{formatBytes(model.size_bytes)}</span>
                      <span>•</span>
                      <span>{model.ram_required_mb} MB RAM</span>
                      <span>•</span>
                      <a
                        href={model.hf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#94a3b8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                      >
                        <span>HF</span>
                        <ExternalLink size={8} />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Right action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  {isDownloading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RefreshCw size={11} className="animate-spin" style={{ color: '#38bdf8' }} />
                      <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>
                        {currentProgress}%
                      </span>
                    </div>
                  ) : isDownloaded ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSelectSuggestionModel(model.id)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 500,
                          backgroundColor: isSuggestionActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                          color: isSuggestionActive ? '#38bdf8' : '#cbd5e1',
                          border: isSuggestionActive ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          transition: 'all 0.12s ease',
                        }}
                        title="Use this model for keystroke auto-suggestions"
                      >
                        <Sparkles size={10} />
                        <span>{isSuggestionActive ? '✓ Suggestion' : 'Set Suggestion'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectReasoningModel(model.id)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 500,
                          backgroundColor: isReasoningActive ? 'rgba(192, 132, 252, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                          color: isReasoningActive ? '#c084fc' : '#cbd5e1',
                          border: isReasoningActive ? '1px solid rgba(192, 132, 252, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          transition: 'all 0.12s ease',
                        }}
                        title="Use this model for '@ query' multi-step reasoning"
                      >
                        <Brain size={10} />
                        <span>{isReasoningActive ? '✓ Reasoning' : 'Set Reasoning'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteModel(model)}
                        title={`Delete ${model.name} from disk`}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          color: '#64748b',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#64748b';
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownload(model)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: '#f1f5f9',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.14)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      }}
                    >
                      <Download size={11} />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Download progress bar */}
              {isDownloading && (
                <div
                  style={{
                    width: '100%',
                    height: '3px',
                    borderRadius: '2px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${currentProgress}%`,
                      height: '100%',
                      backgroundColor: '#38bdf8',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Interactive Tester */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '6px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runTestInference()}
            placeholder="Test model reasoning (e.g. '@ find largest files')..."
            style={{
              flex: 1,
              padding: '5px 8px',
              borderRadius: '5px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#f1f5f9',
              fontSize: '11px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={runTestInference}
            disabled={isTestLoading}
            style={{
              padding: '5px 10px',
              borderRadius: '5px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '11px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              cursor: isTestLoading ? 'not-allowed' : 'pointer',
            }}
          >
            <Play size={10} />
            <span>{isTestLoading ? 'Running...' : 'Test'}</span>
          </button>
        </div>

        {testResult && (
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              padding: '6px 8px',
              borderRadius: '5px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                Output ({testResult.model}):
              </span>
              <button
                type="button"
                onClick={() => copyTestCommand(testResult.command)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 5px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  color: copiedTest ? '#22c55e' : '#94a3b8',
                  fontSize: '10px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {copiedTest ? <Check size={9} /> : <Copy size={9} />}
                <span>{copiedTest ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: '11px',
                fontFamily: `'JetBrains Mono', 'SF Mono', monospace`,
                color: '#e2e8f0',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.3',
              }}
            >
              {testResult.command}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
