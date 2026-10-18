import { WebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';

export interface DetachedWindowInfo {
  tabId: string;
  title: string;
  connectionId?: string;
}

export const WINDOW_BROADCAST_CHANNEL = 'pookie_window_channel';

export type WindowBroadcastMessage =
  | { type: 'TAB_DETACHED'; tabId: string; label: string }
  | { type: 'TAB_DOCKED'; tabId: string }
  | { type: 'FOCUS_WINDOW'; tabId: string }
  | { type: 'CLOSE_DETACHED_WINDOW'; tabId: string };

export function getDetachedWindowLabel(tabId: string): string {
  const sanitized = tabId.replace(/[^a-zA-Z0-9-]/g, '_');
  return `term-pop-${sanitized}`;
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

/**
 * Spawns a dedicated native desktop OS window for a terminal tab.
 * Supports multiple concurrent detached windows across the desktop.
 */
export async function openDetachedTerminalWindow(info: DetachedWindowInfo): Promise<void> {
  const { tabId, title, connectionId = '' } = info;
  const label = getDetachedWindowLabel(tabId);
  const searchParams = new URLSearchParams({
    popupTabId: tabId,
    title,
    connectionId,
  });
  const url = `index.html?${searchParams.toString()}`;

  // Broadcast to other windows / main app that this tab is now running in detached mode
  try {
    const bc = new BroadcastChannel(WINDOW_BROADCAST_CHANNEL);
    bc.postMessage({ type: 'TAB_DETACHED', tabId, label } as WindowBroadcastMessage);
    bc.close();
  } catch {}

  if (isTauriEnvironment()) {
    try {
      const allWindows = await getAllWebviewWindows().catch(() => []);
      const existing = allWindows.find((w) => w.label === label);
      if (existing) {
        await existing.show().catch(() => {});
        await existing.unminimize().catch(() => {});
        await existing.setFocus().catch(() => {});
        return;
      }

      const webview = new WebviewWindow(label, {
        url,
        title: `Pookie · ${title}`,
        width: 920,
        height: 600,
        minWidth: 480,
        minHeight: 320,
        center: true,
        resizable: true,
        decorations: false,
      });

      webview.once('tauri://error', (err) => {
        console.warn('Tauri WebviewWindow error, falling back to browser window.open:', err);
        openBrowserPopup(searchParams.toString(), label);
      });
      return;
    } catch (err) {
      console.warn('Could not launch Tauri WebviewWindow, falling back to window.open:', err);
    }
  }

  // Web preview / browser fallback
  openBrowserPopup(searchParams.toString(), label);
}

function openBrowserPopup(queryString: string, label: string) {
  const width = 920;
  const height = 600;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  window.open(
    `/?${queryString}`,
    `pookie_${label}`,
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
  );
}

/**
 * Focus an existing detached window
 */
export async function focusDetachedWindow(tabId: string): Promise<void> {
  const label = getDetachedWindowLabel(tabId);
  if (isTauriEnvironment()) {
    try {
      const allWindows = await getAllWebviewWindows().catch(() => []);
      const existing = allWindows.find((w) => w.label === label);
      if (existing) {
        await existing.show().catch(() => {});
        await existing.unminimize().catch(() => {});
        await existing.setFocus().catch(() => {});
        return;
      }
    } catch {}
  }

  try {
    const bc = new BroadcastChannel(WINDOW_BROADCAST_CHANNEL);
    bc.postMessage({ type: 'FOCUS_WINDOW', tabId } as WindowBroadcastMessage);
    bc.close();
  } catch {}
}

/**
 * Instructs a detached window to close and dock back to the main app
 */
export async function closeDetachedWindow(tabId: string): Promise<void> {
  const label = getDetachedWindowLabel(tabId);
  if (isTauriEnvironment()) {
    try {
      const allWindows = await getAllWebviewWindows().catch(() => []);
      const existing = allWindows.find((w) => w.label === label);
      if (existing) {
        await existing.close().catch(() => {});
        return;
      }
    } catch {}
  }

  try {
    const bc = new BroadcastChannel(WINDOW_BROADCAST_CHANNEL);
    bc.postMessage({ type: 'CLOSE_DETACHED_WINDOW', tabId } as WindowBroadcastMessage);
    bc.close();
  } catch {}
}
