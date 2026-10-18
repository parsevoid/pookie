import type React from 'react';

// Color palette and theme engine for Pookie Terminal
export interface CustomColorPalette {
  name?: string;
  primary: string;       // 1st color: Primary Accent / Code files (e.g. #d946ef)
  secondary: string;     // 2nd color: Secondary Accent / Archives (e.g. #8b5cf6)
  color3: string;        // 3rd color: Directories / Cyan (e.g. #06b6d4)
  color4: string;        // 4th color: Text / Docs / Warnings (e.g. #facc15)
  color5: string;        // 5th color: Images & Media / Pink (e.g. #f43f5e)
  color6: string;        // 6th color: Executables & Scripts / Emerald / Red (e.g. #10b981)
  text: string;          // Primary text color (e.g. #f8fafc)
  textSecondary: string; // Muted secondary text (e.g. #94a3b8)
  background: string;    // Base background color (e.g. #0b0d14)
  sidebarBg: string;     // Sidebar background (e.g. #111420)
  border?: string;       // Border color (e.g. rgba(255, 255, 255, 0.08))
}

export const THEME_PRESETS: Record<string, CustomColorPalette> = {
  'Minimalist Slate': {
    name: 'Minimalist Slate',
    primary: '#38bdf8',     // Sky Blue
    secondary: '#818cf8',   // Calm Indigo
    color3: '#2dd4bf',      // Teal
    color4: '#fbbf24',      // Soft Amber
    color5: '#f472b6',      // Soft Rose
    color6: '#34d399',      // Minimal Emerald
    text: '#f8fafc',
    textSecondary: '#64748b',
    background: '#0b0f17',
    sidebarBg: '#0e131f',
  },
  'Minimalist Monochrome': {
    name: 'Minimalist Monochrome',
    primary: '#e4e4e7',     // Clean Platinum
    secondary: '#a1a1aa',   // Refined Zinc
    color3: '#71717a',      // Cool Slate
    color4: '#f4f4f5',      // Bright White
    color5: '#d4d4d8',      // Muted Silver
    color6: '#fafafa',      // Pure White
    text: '#f4f4f5',
    textSecondary: '#71717a',
    background: '#09090b',
    sidebarBg: '#0e0e11',
  },
  'Minimalist Obsidian': {
    name: 'Minimalist Obsidian',
    primary: '#22c55e',     // Pitch Emerald
    secondary: '#10b981',   // Obsidian Mint
    color3: '#06b6d4',      // Crisp Cyan
    color4: '#eab308',      // Warm Ochre
    color5: '#ec4899',      // Minimal Pink
    color6: '#14b8a6',      // Minimal Teal
    text: '#f3f4f6',
    textSecondary: '#6b7280',
    background: '#030304',
    sidebarBg: '#07070a',
  },
  'Pookie Cyberpunk': {
    name: 'Pookie Cyberpunk',
    primary: '#d946ef',     // Neon Fuchsia
    secondary: '#8b5cf6',   // Electric Violet
    color3: '#06b6d4',      // Cyber Cyan (Directories)
    color4: '#facc15',      // Neon Yellow (Text docs)
    color5: '#f43f5e',      // Rose Pink (Images)
    color6: '#10b981',      // Matrix Emerald (Executables)
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    background: '#090b10',
    sidebarBg: '#0e121a',
  },
  'Ethical Kali': {
    name: 'Ethical Kali',
    primary: '#6366f1',     // Kali Indigo
    secondary: '#0284c7',   // Sky Blue
    color3: '#14b8a6',      // Teal
    color4: '#eab308',      // Amber
    color5: '#a855f7',      // Purple
    color6: '#ef4444',      // Exploit Red
    text: '#f1f5f9',
    textSecondary: '#64748b',
    background: '#0f172a',
    sidebarBg: '#0b0f19',
  },
  'Matrix Void': {
    name: 'Matrix Void',
    primary: '#22c55e',     // Terminal Green
    secondary: '#10b981',   // Matrix Emerald
    color3: '#38bdf8',      // Cyan Data
    color4: '#a3e635',      // Lime Text
    color5: '#06b6d4',      // Deep Cyan
    color6: '#4ade80',      // Phosphor Run
    text: '#4ade80',
    textSecondary: '#15803d',
    background: '#030804',
    sidebarBg: '#020502',
  },
  'Dracula Hacker': {
    name: 'Dracula Hacker',
    primary: '#bd93f9',     // Dracula Purple
    secondary: '#8be9fd',   // Dracula Cyan
    color3: '#50fa7b',      // Dracula Green
    color4: '#f1fa8c',      // Dracula Yellow
    color5: '#ff79c6',      // Dracula Pink
    color6: '#ff5555',      // Dracula Red
    text: '#f8f8f2',
    textSecondary: '#6272a4',
    background: '#1e1f29',
    sidebarBg: '#181920',
  },
  'Nordic Frost': {
    name: 'Nordic Frost',
    primary: '#88c0d0',     // Frost Cyan
    secondary: '#81a1c1',   // Frost Blue
    color3: '#8fbcbb',      // Frost Teal
    color4: '#ebcb8b',      // Aurora Yellow
    color5: '#b48ead',      // Aurora Purple
    color6: '#a3be8c',      // Aurora Green
    text: '#eceff4',
    textSecondary: '#d8dee9',
    background: '#242933',
    sidebarBg: '#1e222a',
  },
  'Sunset Synthwave': {
    name: 'Sunset Synthwave',
    primary: '#f43f5e',     // Sunset Rose
    secondary: '#fb923c',   // Warm Orange
    color3: '#38bdf8',      // Neon Sky
    color4: '#facc15',      // Gold Horizon
    color5: '#c084fc',      // Neon Violet
    color6: '#34d399',      // Synth Mint
    text: '#fdf4ff',
    textSecondary: '#a855f7',
    background: '#120d1f',
    sidebarBg: '#0d0917',
  },
};

export const DEFAULT_PALETTE: CustomColorPalette = THEME_PRESETS['Pookie Cyberpunk'];

// Fallback constant for legacy imports
export const ColorPalette = {
  background: '#14171f',
  sidebarBackground: '#1a1c24',
  surfaceElevated: '#21242e',
  surfaceHover: '#292c38',

  textPrimary: '#e6e8ed',
  textSecondary: '#8c919e',
  textMuted: '#666b78',

  accentPurple: '#8c66f2',
  accentBlue: '#598cf2',
  accentCyan: '#40d9f2',
  accentGreen: '#4dcc80',
  accentRed: '#e65966',
  accentYellow: '#f2bf4d',
  accentOrange: '#f28c4d',

  separator: '#333640',
  border: '#2e303b',

  terminalPromptUser: '#4dcc80',
  terminalPromptHost: '#598cf2',
  terminalCursor: '#e6e8ed',
};

export const TerminalTheme = {
  background: '#14171f',
  foreground: '#e6e8ed',
  cursor: '#e6e8ed',
  cursorAccent: '#14171f',
  selectionBackground: '#598cf244',
  black: '#262933',
  red: '#e65966',
  green: '#4dcc80',
  yellow: '#f2bf4d',
  blue: '#598cf2',
  magenta: '#bf73e6',
  cyan: '#66ccd9',
  white: '#bfc2cc',
  brightBlack: '#666b78',
  brightRed: '#f27380',
  brightGreen: '#66e699',
  brightYellow: '#ffd966',
  brightBlue: '#80b3ff',
  brightMagenta: '#d98cff',
  brightCyan: '#8ce6f2',
  brightWhite: '#e6e8ed',
};

// Generates an xterm theme object from a CustomColorPalette and opacity
export function getTerminalTheme(palette: CustomColorPalette, opacity: number = 0.88, hasWallpaper: boolean = false) {
  const isTransparent = opacity < 1 || hasWallpaper;
  return {
    background: isTransparent ? 'transparent' : (palette.background || '#090b10'),
    foreground: palette.text || '#f8fafc',
    cursor: palette.primary || '#d946ef',
    cursorAccent: palette.background || '#090b10',
    selectionBackground: `${palette.primary || '#d946ef'}44`,
    black: '#1a1d24',
    red: palette.color6 || '#ef4444',
    green: palette.color6 || '#10b981',
    yellow: palette.color4 || '#facc15',
    blue: palette.secondary || '#8b5cf6',
    magenta: palette.color5 || '#f43f5e',
    cyan: palette.color3 || '#06b6d4',
    white: palette.text || '#f8fafc',
    brightBlack: palette.textSecondary || '#64748b',
    brightRed: palette.color6 || '#ef4444',
    brightGreen: palette.primary || '#10b981',
    brightYellow: palette.color4 || '#facc15',
    brightBlue: palette.secondary || '#8b5cf6',
    brightMagenta: palette.color5 || '#f43f5e',
    brightCyan: palette.color3 || '#06b6d4',
    brightWhite: '#ffffff',
  };
}

export type UiSizePreset = 'compact' | 'standard' | 'comfortable';

export interface SizePresetConfig {
  id: UiSizePreset;
  label: string;
  sublabel: string;
  terminalFontSize: number;
  tokens: {
    '--font-size-xs': string;
    '--font-size-sm': string;
    '--font-size-base': string;
    '--font-size-md': string;
    '--font-size-lg': string;
    '--font-size-xl': string;
    '--tab-height': string;
    '--tab-font-size': string;
    '--btn-font-size': string;
    '--input-font-size': string;
  };
}

export const SIZE_PRESETS: Record<UiSizePreset, SizePresetConfig> = {
  compact: {
    id: 'compact',
    label: 'Compact',
    sublabel: 'Dense (11px base)',
    terminalFontSize: 11,
    tokens: {
      '--font-size-xs': '9px',
      '--font-size-sm': '10px',
      '--font-size-base': '11px',
      '--font-size-md': '12px',
      '--font-size-lg': '13px',
      '--font-size-xl': '14px',
      '--tab-height': '34px',
      '--tab-font-size': '11px',
      '--btn-font-size': '11px',
      '--input-font-size': '11px',
    },
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    sublabel: 'Balanced (12px base)',
    terminalFontSize: 13,
    tokens: {
      '--font-size-xs': '10px',
      '--font-size-sm': '11px',
      '--font-size-base': '12px',
      '--font-size-md': '13px',
      '--font-size-lg': '14px',
      '--font-size-xl': '15px',
      '--tab-height': '38px',
      '--tab-font-size': '12px',
      '--btn-font-size': '12px',
      '--input-font-size': '12px',
    },
  },
  comfortable: {
    id: 'comfortable',
    label: 'Comfortable',
    sublabel: 'Spacious (13px base)',
    terminalFontSize: 15,
    tokens: {
      '--font-size-xs': '11px',
      '--font-size-sm': '12px',
      '--font-size-base': '13px',
      '--font-size-md': '14px',
      '--font-size-lg': '16px',
      '--font-size-xl': '17px',
      '--tab-height': '42px',
      '--tab-font-size': '13px',
      '--btn-font-size': '13px',
      '--input-font-size': '13px',
    },
  },
};

// Injects dynamic CSS variables for real-time reactivity
export function applyThemeCssVariables(
  palette: CustomColorPalette,
  opacity: number = 0.88,
  sizePreset: UiSizePreset = 'standard'
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--bg', palette.background);
  root.style.setProperty('--sidebar-bg', palette.sidebarBg);
  root.style.setProperty('--text-primary', palette.text);
  root.style.setProperty('--text-secondary', palette.textSecondary);
  root.style.setProperty('--accent-purple', palette.primary);
  root.style.setProperty('--accent-blue', palette.secondary);
  root.style.setProperty('--accent-cyan', palette.color3);
  root.style.setProperty('--accent-yellow', palette.color4);
  root.style.setProperty('--accent-magenta', palette.color5);
  root.style.setProperty('--accent-green', palette.color6);
  root.style.setProperty('--theme-primary', palette.primary);
  root.style.setProperty('--theme-secondary', palette.secondary);
  root.style.setProperty('--btn-primary-bg', palette.primary);
  root.style.setProperty('--btn-primary-hover', `${palette.primary}ee`);
  root.style.setProperty('--btn-secondary-bg', `${palette.primary}18`);
  root.style.setProperty('--btn-secondary-border', `${palette.primary}44`);
  root.style.setProperty('--btn-secondary-hover', `${palette.primary}28`);
  root.style.setProperty('--bg-opacity', String(opacity));

  // Unified typography font family tokens
  root.style.setProperty(
    '--font-ui',
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  );
  root.style.setProperty(
    '--font-mono',
    "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace"
  );

  // Apply typography size preset tokens
  const config = SIZE_PRESETS[sizePreset] || SIZE_PRESETS.standard;
  for (const [key, value] of Object.entries(config.tokens)) {
    root.style.setProperty(key, value);
  }
}

/**
 * Returns a minimalist, theme-reactive primary button style.
 */
export function getThemePrimaryButtonStyle(palette?: CustomColorPalette): React.CSSProperties {
  const primary = palette?.primary || 'var(--theme-primary, #38bdf8)';
  return {
    backgroundColor: primary,
    color: '#090b10',
    border: '1px solid transparent',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '12px',
    padding: '6px 14px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: 'none',
  };
}

/**
 * Returns a minimalist, theme-reactive secondary/outline button style.
 */
export function getThemeSecondaryButtonStyle(palette?: CustomColorPalette): React.CSSProperties {
  const primary = palette?.primary || 'var(--theme-primary, #38bdf8)';
  return {
    backgroundColor: `${primary}14`,
    color: primary,
    border: `1px solid ${primary}38`,
    borderRadius: '6px',
    fontWeight: 500,
    fontSize: '12px',
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  };
}
