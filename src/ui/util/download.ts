import { isTauri, saveTextFileViaTauri } from '../tauri/bridge.js';

/**
 * Save a string as a file.
 *
 * In Tauri builds the WKWebView/WebView2 doesn't surface a download UI for
 * `<a href="blob:..." download>` clicks, so we route through a native command
 * (OS save dialog + filesystem write). In browser preview mode we fall back to
 * the standard blob-download trick.
 */
export async function downloadFile(
  content: string,
  mime: string,
  filename: string,
): Promise<{ ok: boolean; cancelled?: boolean; error?: string; path?: string }> {
  if (isTauri()) {
    try {
      const ext = filename.split('.').pop() ?? '';
      const filterName = mime.includes('json')
        ? 'JSON'
        : mime.includes('markdown')
          ? 'Markdown'
          : 'File';
      const path = await saveTextFileViaTauri(content, {
        defaultFilename: filename,
        filters: ext ? [{ name: filterName, extensions: [ext] }] : undefined,
      });
      if (path === null) return { ok: false, cancelled: true };
      return { ok: true, path };
    } catch (e) {
      console.error('[authlens] Tauri save failed:', e);
      return { ok: false, error: (e as Error).message ?? String(e) };
    }
  }

  // Browser fallback — blob URL + anchor click + deferred revoke.
  // Some webviews require the anchor to be in the DOM tree before click().
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 1000);
    return { ok: true };
  } catch (e) {
    console.error('[authlens] blob download failed:', e);
    return { ok: false, error: (e as Error).message ?? String(e) };
  }
}
