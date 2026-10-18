import React, { useState, useEffect } from 'react';
import {
  X,
  Monitor,
  Terminal,
  Brain,
  Palette,
  Image as ImageIcon,
  Sliders,
  RotateCcw,
  Type,
  Sparkles,
} from 'lucide-react';
import type { AppSettings } from '../../stores/appState';
import modelRegistryData from '../../models/model_registry.json';
import {
  ColorPalette,
  THEME_PRESETS,
  DEFAULT_PALETTE,
  type CustomColorPalette,
  applyThemeCssVariables,
  type UiSizePreset,
  SIZE_PRESETS,
} from '../../styles/theme';
import { compressImage, saveCustomWallpaperToDb, getCustomWallpaperFromDb } from '../../utils/wallpaperStorage';
import { ModelManagerContent } from './ModelManagerContent';
import logoImg from '../../assets/logo.png';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  initialTab?: 'appearance' | 'models' | 'system';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  initialTab = 'appearance',
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'models' | 'system'>(initialTab);
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [systemInfo, setSystemInfo] = useState<{ os: string; arch: string; family: string }>({
    os: 'unknown',
    arch: 'unknown',
    family: 'unknown',
  });

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
    if (
      isOpen &&
      localSettings.backgroundImage === 'custom' &&
      (!localSettings.backgroundCustomUrl || localSettings.backgroundCustomUrl === 'indexeddb://custom_wallpaper')
    ) {
      getCustomWallpaperFromDb().then((customUrl) => {
        if (customUrl) {
          setLocalSettings((prev) => ({
            ...prev,
            backgroundCustomUrl: customUrl,
          }));
        }
      });
    }
  }, [isOpen, initialTab, localSettings.backgroundImage]);


  useEffect(() => {
    if (isOpen) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => {
          invoke<{ os: string; arch: string; family: string }>('get_system_info')
            .then((info) => setSystemInfo(info))
            .catch(() => {});
        })
        .catch(() => {
          setSystemInfo({
            os: navigator.platform,
            arch: 'x64/arm64',
            family: 'unix',
          });
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPalette: CustomColorPalette = localSettings.customPalette || DEFAULT_PALETTE;
  const primaryColor = currentPalette.primary;

  const updatePaletteField = (field: keyof CustomColorPalette, value: string) => {
    const updatedPalette = {
      ...currentPalette,
      [field]: value,
    };
    const nextSettings: AppSettings = {
      ...localSettings,
      theme: 'Custom Palette',
      customPalette: updatedPalette,
    };
    setLocalSettings(nextSettings);
    onUpdateSettings(nextSettings);
    applyThemeCssVariables(updatedPalette, localSettings.backgroundOpacity, localSettings.sizePreset || 'standard');
  };

  const selectPresetTheme = (presetName: string) => {
    const preset = THEME_PRESETS[presetName];
    if (!preset) return;
    const nextSettings: AppSettings = {
      ...localSettings,
      theme: presetName,
      customPalette: preset,
    };
    setLocalSettings(nextSettings);
    onUpdateSettings(nextSettings);
    applyThemeCssVariables(preset, localSettings.backgroundOpacity, localSettings.sizePreset || 'standard');
  };

  const handleOpacityChange = (opacity: number) => {
    const nextSettings: AppSettings = {
      ...localSettings,
      backgroundOpacity: opacity,
    };
    setLocalSettings(nextSettings);
    onUpdateSettings(nextSettings);
    applyThemeCssVariables(currentPalette, opacity, localSettings.sizePreset || 'standard');
  };

  const handleSizePresetChange = (preset: UiSizePreset) => {
    const presetConfig = SIZE_PRESETS[preset];
    const nextSettings: AppSettings = {
      ...localSettings,
      sizePreset: preset,
      fontSize: presetConfig.terminalFontSize,
    };
    setLocalSettings(nextSettings);
    onUpdateSettings(nextSettings);
    applyThemeCssVariables(currentPalette, localSettings.backgroundOpacity, preset);
  };

  const handleWallpaperChange = (bgType: string, customUrl: string = localSettings.backgroundCustomUrl || '') => {
    const nextSettings: AppSettings = {
      ...localSettings,
      backgroundImage: bgType,
      backgroundCustomUrl: customUrl,
    };
    setLocalSettings(nextSettings);
    onUpdateSettings(nextSettings);
  };

  const handleCustomImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Compress to max 1920x1080 JPEG at 0.82 quality to prevent memory spikes & quota issues
      const compressedUrl = await compressImage(file, 1920, 1080, 0.82);
      if (compressedUrl) {
        await saveCustomWallpaperToDb(compressedUrl);
        handleWallpaperChange('custom', compressedUrl);
      }
    } catch (err) {
      console.warn('Failed to compress image, falling back to standard read:', err);
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          saveCustomWallpaperToDb(dataUrl).catch(() => {});
          handleWallpaperChange('custom', dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
  };


  const isModelsTab = activeTab === 'models';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: isModelsTab ? '760px' : '620px',
          maxWidth: '96vw',
          maxHeight: '88vh',
          backgroundColor: currentPalette.sidebarBg || '#0d1017',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.75)',
          transition: 'width 0.18s ease',
        }}
      >
        {/* Minimalist Header */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: primaryColor,
                backgroundColor: `${primaryColor}16`,
                border: `1px solid ${primaryColor}33`,
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              &gt;_
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: currentPalette.text, letterSpacing: '-0.2px' }}>
              Settings &amp; Preferences
            </span>
          </div>

          <button
            type="button"
            title="Close (Esc)"
            onClick={onClose}
            style={{
              color: ColorPalette.textMuted,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '5px',
              borderRadius: '5px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = currentPalette.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = ColorPalette.textMuted;
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Minimalist Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            padding: '0 14px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'appearance' ? 600 : 500,
              color: activeTab === 'appearance' ? primaryColor : ColorPalette.textSecondary,
              borderBottom: activeTab === 'appearance' ? `2px solid ${primaryColor}` : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.12s ease',
            }}
          >
            <Palette size={13} />
            <span>Theme &amp; Colors</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('models')}
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'models' ? 600 : 500,
              color: activeTab === 'models' ? primaryColor : ColorPalette.textSecondary,
              borderBottom: activeTab === 'models' ? `2px solid ${primaryColor}` : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.12s ease',
            }}
          >
            <Brain size={13} />
            <span>Model Manager</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'system' ? 600 : 500,
              color: activeTab === 'system' ? currentPalette.text : ColorPalette.textSecondary,
              borderBottom: activeTab === 'system' ? `2px solid ${currentPalette.text}` : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.12s ease',
            }}
          >
            <Monitor size={13} />
            <span>System</span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '16px 18px', flex: 1, overflowY: 'auto' }}>
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Presets Grid */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Palette size={14} color={primaryColor} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: currentPalette.text }}>
                      Theme Presets
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectPresetTheme('Minimalist Slate')}
                    style={{
                      fontSize: '10px',
                      color: ColorPalette.textMuted,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                    }}
                  >
                    <RotateCcw size={10} />
                    <span>Reset Minimal</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {Object.keys(THEME_PRESETS).map((presetKey) => {
                    const isSelected = localSettings.theme === presetKey;
                    const p = THEME_PRESETS[presetKey];
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => selectPresetTheme(presetKey)}
                        style={{
                          padding: '7px 9px',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? `${primaryColor}16` : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isSelected ? primaryColor : 'rgba(255, 255, 255, 0.07)'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          textAlign: 'left',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected ? primaryColor : currentPalette.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {presetKey}
                        </span>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: p.primary }} />
                          <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: p.secondary }} />
                          <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: p.color3 }} />
                          <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: p.color4 }} />
                          <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: p.color5 }} />
                          <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: p.color6 }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 6-Color Custom Palette (Customizable Color Theme) */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sliders size={14} color={primaryColor} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: currentPalette.text }}>
                      Customizable Palette &amp; Button Colors
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: ColorPalette.textMuted }}>Live Button Preview:</span>
                    <button
                      type="button"
                      style={{
                        padding: '3px 10px',
                        borderRadius: '5px',
                        backgroundColor: currentPalette.primary,
                        color: '#090b10',
                        fontSize: '10px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'default',
                        boxShadow: `0 0 8px ${currentPalette.primary}33`,
                      }}
                    >
                      Action Button
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {/* Primary Accent & Button Color */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: `1px solid ${currentPalette.primary}44`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.primary }}>1. Button Color &amp; Primary Accent</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.primary}
                        onChange={(e) => updatePaletteField('primary', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.primary}</span>
                    </div>
                  </div>

                  {/* Secondary Accent */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.secondary }}>2. Secondary / Archives</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.secondary}
                        onChange={(e) => updatePaletteField('secondary', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.secondary}</span>
                    </div>
                  </div>

                  {/* Directory / Cyan */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.color3 }}>3. Directories / Folder</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.color3}
                        onChange={(e) => updatePaletteField('color3', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.color3}</span>
                    </div>
                  </div>

                  {/* Text / Docs */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.color4 }}>4. Text &amp; Documents</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.color4}
                        onChange={(e) => updatePaletteField('color4', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.color4}</span>
                    </div>
                  </div>

                  {/* Media / Images */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.color5 }}>5. Media &amp; Images</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.color5}
                        onChange={(e) => updatePaletteField('color5', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.color5}</span>
                    </div>
                  </div>

                  {/* Executables */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.color6 }}>6. Executables &amp; Scripts</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.color6}
                        onChange={(e) => updatePaletteField('color6', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.color6}</span>
                    </div>
                  </div>

                  {/* Foreground Text */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.text }}>Foreground Text</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.text}
                        onChange={(e) => updatePaletteField('text', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.text}</span>
                    </div>
                  </div>

                  {/* Base Background */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: currentPalette.text }}>Base Background</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="color"
                        value={currentPalette.background}
                        onChange={(e) => updatePaletteField('background', e.target.value)}
                        style={{ width: '20px', height: '20px', border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: ColorPalette.textMuted }}>{currentPalette.background}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Wallpaper & Opacity Controls */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <ImageIcon size={14} color={primaryColor} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: currentPalette.text }}>
                    Window &amp; Background
                  </span>
                </div>

                {/* Opacity Slider */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', color: ColorPalette.textSecondary }}>
                      Background Opacity
                    </label>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: primaryColor,
                        fontFamily: 'monospace',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: `${primaryColor}16`,
                      }}
                    >
                      {Math.round((localSettings.backgroundOpacity ?? 0.88) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={Math.round((localSettings.backgroundOpacity ?? 0.88) * 100)}
                    onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
                    style={{ width: '100%', accentColor: primaryColor, cursor: 'pointer' }}
                  />
                </div>

                {/* Wallpaper Options */}
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleWallpaperChange('none')}
                      style={{
                        padding: '6px',
                        borderRadius: '5px',
                        backgroundColor: localSettings.backgroundImage === 'none' ? `${primaryColor}18` : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${localSettings.backgroundImage === 'none' ? primaryColor : 'rgba(255, 255, 255, 0.07)'}`,
                        color: localSettings.backgroundImage === 'none' ? primaryColor : ColorPalette.textSecondary,
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Solid Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWallpaperChange('gradient')}
                      style={{
                        padding: '6px',
                        borderRadius: '5px',
                        backgroundColor: localSettings.backgroundImage === 'gradient' ? `${primaryColor}18` : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${localSettings.backgroundImage === 'gradient' ? primaryColor : 'rgba(255, 255, 255, 0.07)'}`,
                        color: localSettings.backgroundImage === 'gradient' ? primaryColor : ColorPalette.textSecondary,
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Aurora
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWallpaperChange('cyberpunk')}
                      style={{
                        padding: '6px',
                        borderRadius: '5px',
                        backgroundColor: localSettings.backgroundImage === 'cyberpunk' ? `${primaryColor}18` : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${localSettings.backgroundImage === 'cyberpunk' ? primaryColor : 'rgba(255, 255, 255, 0.07)'}`,
                        color: localSettings.backgroundImage === 'cyberpunk' ? primaryColor : ColorPalette.textSecondary,
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Cyber Matrix
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWallpaperChange('custom')}
                      style={{
                        padding: '6px',
                        borderRadius: '5px',
                        backgroundColor: localSettings.backgroundImage === 'custom' ? `${primaryColor}18` : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${localSettings.backgroundImage === 'custom' ? primaryColor : 'rgba(255, 255, 255, 0.07)'}`,
                        color: localSettings.backgroundImage === 'custom' ? primaryColor : ColorPalette.textSecondary,
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Custom File
                    </button>
                  </div>

                  {localSettings.backgroundImage === 'custom' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCustomImageUpload}
                        style={{
                          fontSize: '11px',
                          color: ColorPalette.textSecondary,
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          padding: '5px',
                          borderRadius: '5px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Or paste image URL (https://...)"
                        value={localSettings.backgroundCustomUrl || ''}
                        onChange={(e) => handleWallpaperChange('custom', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '5px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: currentPalette.text,
                          fontSize: '11px',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* UI Typography & Size Presets (3 Presets) */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Type size={14} color={primaryColor} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: currentPalette.text }}>
                      UI Typography &amp; Size Presets
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: ColorPalette.textMuted }}>
                    Consistent sizing across all tabs &amp; views
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['compact', 'standard', 'comfortable'] as UiSizePreset[]).map((presetKey) => {
                    const preset = SIZE_PRESETS[presetKey];
                    const isSelected = (localSettings.sizePreset || 'standard') === presetKey;
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSizePresetChange(presetKey)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? `${primaryColor}18` : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isSelected ? primaryColor : 'rgba(255, 255, 255, 0.08)'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                          textAlign: 'left',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: isSelected ? 600 : 500,
                              color: isSelected ? primaryColor : currentPalette.text,
                            }}
                          >
                            {preset.label}
                          </span>
                          {isSelected && (
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: primaryColor,
                              }}
                            />
                          )}
                        </div>
                        <span style={{ fontSize: '10px', color: ColorPalette.textMuted }}>
                          {preset.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Terminal Typography & Cursor */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <Terminal size={14} color={primaryColor} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: currentPalette.text }}>
                    Terminal Font &amp; Cursor
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: ColorPalette.textSecondary, display: 'block', marginBottom: '4px' }}>
                      Font Family
                    </label>
                    <select
                      value={localSettings.fontFamily}
                      onChange={(e) => setLocalSettings({ ...localSettings, fontFamily: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '5px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: currentPalette.text,
                        fontSize: '11px',
                      }}
                    >
                      <option value="JetBrains Mono">JetBrains Mono (Default)</option>
                      <option value="SF Mono">SF Mono (macOS Native)</option>
                      <option value="Fira Code">Fira Code</option>
                      <option value="Menlo">Menlo</option>
                      <option value="Consolas">Consolas</option>
                      <option value="monospace">Standard Monospace</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '10px', color: ColorPalette.textSecondary, display: 'block', marginBottom: '4px' }}>
                      Font Size ({localSettings.fontSize}px)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={24}
                      value={localSettings.fontSize}
                      onChange={(e) => setLocalSettings({ ...localSettings, fontSize: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: primaryColor, marginTop: '6px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: ColorPalette.textSecondary, display: 'block', marginBottom: '4px' }}>
                      Cursor Style
                    </label>
                    <select
                      value={localSettings.cursorStyle}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          cursorStyle: e.target.value as 'block' | 'underline' | 'bar',
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '5px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: currentPalette.text,
                        fontSize: '11px',
                      }}
                    >
                      <option value="block">Block (█)</option>
                      <option value="underline">Underline (_)</option>
                      <option value="bar">Bar (|)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="cursorBlink"
                      checked={localSettings.cursorBlink}
                      onChange={(e) => setLocalSettings({ ...localSettings, cursorBlink: e.target.checked })}
                      style={{ accentColor: primaryColor }}
                    />
                    <label htmlFor="cursorBlink" style={{ fontSize: '11px', color: currentPalette.text, cursor: 'pointer' }}>
                      Blink Cursor
                    </label>
                  </div>
                </div>
              </div>

              {/* AI & Automation Models */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Brain size={14} color={primaryColor} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: currentPalette.text }}>
                      AI Inference Models
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('models')}
                    style={{
                      fontSize: '11px',
                      color: primaryColor,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    Manage &amp; Download Models →
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: ColorPalette.textSecondary, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      <Sparkles size={11} color="#38bdf8" />
                      <span>Auto-Suggestion Model</span>
                    </label>
                    <select
                      value={localSettings.aiModel || 'ternary-bonsai-1.7b'}
                      onChange={(e) => {
                        const next = { ...localSettings, aiModel: e.target.value };
                        setLocalSettings(next);
                        onUpdateSettings(next);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '5px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: currentPalette.text,
                        fontSize: '11px',
                      }}
                    >
                      {modelRegistryData.models.map((m) => (
                        <option key={`opt-sug-${m.id}`} value={m.id}>
                          {m.name} {m.id === 'ternary-bonsai-1.7b' ? '★ [Recommended]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '10px', color: ColorPalette.textSecondary, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      <Brain size={11} color="#c084fc" />
                      <span>Reasoning Model (@)</span>
                    </label>
                    <select
                      value={localSettings.reasoningModel || 'ternary-bonsai-27b'}
                      onChange={(e) => {
                        const next = { ...localSettings, reasoningModel: e.target.value };
                        setLocalSettings(next);
                        onUpdateSettings(next);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '5px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: currentPalette.text,
                        fontSize: '11px',
                      }}
                    >
                      {modelRegistryData.models.map((m) => (
                        <option key={`opt-reas-${m.id}`} value={m.id}>
                          {m.name} {m.id === 'ternary-bonsai-27b' ? '★ [Recommended]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'models' && (
            <ModelManagerContent
              settings={localSettings}
              onUpdateSettings={(newSettings) => {
                setLocalSettings(newSettings);
                onUpdateSettings(newSettings);
              }}
              isEmbedded={true}
            />
          )}

          {activeTab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '12px 14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <img
                  src={logoImg}
                  alt="Pookie Logo"
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    border: `1px solid ${primaryColor}40`,
                    boxShadow: `0 4px 12px ${primaryColor}20`,
                    objectFit: 'cover',
                  }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: currentPalette.text }}>
                    Pookie Terminal
                  </div>
                  <div style={{ fontSize: '11px', color: ColorPalette.textSecondary }}>
                    Cross-Platform Ethical Hacker Terminal &amp; SSH Client
                  </div>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: ColorPalette.textSecondary }}>Application</span>
                  <span style={{ fontWeight: 600, color: primaryColor }}>
                    Pookie Terminal v0.1.0
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: ColorPalette.textSecondary }}>Target OS</span>
                  <span style={{ fontWeight: 500, color: currentPalette.text, textTransform: 'capitalize' }}>
                    {systemInfo.os}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: ColorPalette.textSecondary }}>Architecture</span>
                  <span style={{ fontWeight: 500, color: currentPalette.text }}>
                    {systemInfo.arch}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: ColorPalette.textSecondary }}>Platform Family</span>
                  <span style={{ fontWeight: 500, color: currentPalette.text }}>
                    {systemInfo.family}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: ColorPalette.textSecondary }}>Engine</span>
                  <span style={{ fontWeight: 500, color: currentPalette.color6 }}>
                    Tauri 2.0 + React 19 + Pookie Engine
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Minimalist Footer with Theme-Reactive Buttons */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              color: ColorPalette.textSecondary,
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = currentPalette.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = ColorPalette.textSecondary;
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              backgroundColor: primaryColor,
              color: '#090b10',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px solid transparent',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
