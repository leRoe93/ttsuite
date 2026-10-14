import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { emptyData, load, save, STORAGE_KEY, type AppData, type KeyValueStore } from './store.ts';

/** React binding for the local store: in-memory state, debounced persistence, multi-tab protection. */

export interface StorageStatus {
  state: 'saved' | 'saving' | 'error' | 'unavailable';
  message?: string;
  lastSaved?: Date;
  bytes?: number;
}

interface Ctx {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replaceAll: (d: AppData) => void;
  status: StorageStatus;
  loadError?: { error: string; raw: string };
  externalChange: boolean;
  reloadFromStorage: () => void;
}

const AppDataContext = createContext<Ctx | null>(null);

function getKv(): KeyValueStore | null {
  try {
    const k = '__ttsuite_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const kv = useMemo(getKv, []);
  const initial = useMemo(() => (kv ? load(kv) : { ok: true as const, data: emptyData() }), [kv]);
  const [data, setData] = useState<AppData>(initial.ok ? initial.data : emptyData());
  const [loadError, setLoadError] = useState(initial.ok ? undefined : { error: initial.error, raw: initial.raw });
  const [status, setStatus] = useState<StorageStatus>(kv ? { state: 'saved' } : { state: 'unavailable', message: 'Browser-Speicher nicht verfügbar – Daten gehen beim Schließen verloren. Bitte Sicherungen exportieren.' });
  const [externalChange, setExternalChange] = useState(false);
  const dirty = useRef(false);
  const latest = useRef(data);
  latest.current = data;

  const flush = useCallback(() => {
    if (!kv || !dirty.current || loadError) return;
    const r = save(kv, latest.current);
    dirty.current = false;
    setStatus(r.ok ? { state: 'saved', lastSaved: new Date(), bytes: r.bytes } : { state: 'error', message: r.error });
  }, [kv, loadError]);

  useEffect(() => {
    if (!dirty.current) return;
    setStatus((s) => ({ ...s, state: 'saving' }));
    const t = setTimeout(flush, 400);
    return () => clearTimeout(t);
  }, [data, flush]);

  useEffect(() => {
    const onUnload = () => flush();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setExternalChange(true);
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('storage', onStorage);
    };
  }, [flush]);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    dirty.current = true;
    setData((d) => fn(d));
  }, []);

  const replaceAll = useCallback((d: AppData) => {
    dirty.current = true;
    setLoadError(undefined);
    setData(d);
  }, []);

  const reloadFromStorage = useCallback(() => {
    if (!kv) return;
    const r = load(kv);
    if (r.ok) {
      dirty.current = false;
      setData(r.data);
    }
    setExternalChange(false);
  }, [kv]);

  const value = useMemo(() => ({ data, update, replaceAll, status, loadError, externalChange, reloadFromStorage }), [data, update, replaceAll, status, loadError, externalChange, reloadFromStorage]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): Ctx {
  const c = useContext(AppDataContext);
  if (!c) throw new Error('useAppData außerhalb des Providers');
  return c;
}
