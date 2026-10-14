/** Browser download helper – the only way data leaves the app (explicit user action). */
export function downloadText(fileName: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'export'
  );
}

export async function readFileText(file: File, maxBytes: number): Promise<{ text: string; encoding: string }> {
  if (file.size > maxBytes) throw new Error(`Datei zu groß (${Math.round(file.size / 1024)} KB, max. ${Math.round(maxBytes / 1024)} KB).`);
  const buf = new Uint8Array(await file.arrayBuffer());
  const { decodeText } = await import('../imports/csv.ts');
  return decodeText(buf);
}

export const APP_VERSION = '0.1.0';
