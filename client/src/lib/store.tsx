// App-wide public configuration, citizen contact session, and official session.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { fingerprint } from './device';

export interface Category {
  code: string;
  group: string;
  name: string;
  emoji: string;
  slaDays: number;
  severity: string;
  popular: boolean;
  sensitive: boolean;
  hint: string;
  department: string;
}

export interface PublicConfig {
  freeTier: null | { notice: string; uploadsPaused: boolean; videosPaused: boolean };
  categories: Category[];
  groups: { code: string; name: string }[];
  statuses: Record<string, { label: string; publicLabel: string; closed: boolean }>;
  settings: {
    maxPhotos: number;
    maxVideoSeconds: number;
    requireDeviceLocation: boolean;
    maxPinDistanceM: number;
    allowGalleryUploads: boolean;
    duplicateRadiusM: number;
    maxReportsPerHour: number;
    maxReportsPerDay: number;
  };
  city: { center: { lat: number; lng: number }; bbox: number[] };
  corporations: { key: string; name: string; wardCount: number }[];
  wardCount: number;
  wardAttribution: string;
}

export interface Citizen {
  name: string;
  phoneMasked: string;
  locality: string;
  reports: number;
  strikes: number;
  warning: string;
  blocked: null | { message: string; until: string | null; reason: string };
}

export interface Official {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  role: 'admin' | 'officer';
  areas: string[];
  categories: string[];
  canViewSensitive: boolean;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string;
}

// ------------------------------------------------------------- public config
const ConfigCtx = createContext<{ config: PublicConfig | null; error: string; reload: () => void }>(null as any);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api
      .get<PublicConfig>('/api/public/config')
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return <ConfigCtx.Provider value={{ config, error, reload: load }}>{children}</ConfigCtx.Provider>;
}
export const useConfig = () => useContext(ConfigCtx);

// ------------------------------------------------------------- citizen session
interface CitizenCtx {
  citizen: Citizen | null;
  loading: boolean;
  refresh: () => Promise<void>;
  startSession: (phone: string, name: string) => Promise<Citizen>;
  logout: () => Promise<void>;
}
const CitizenContext = createContext<CitizenCtx>(null as any);

export function CitizenProvider({ children }: { children: ReactNode }) {
  const [citizen, setCitizen] = useState<Citizen | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ citizen: Citizen | null }>('/api/public/session');
      setCitizen(r.citizen);
    } catch {
      setCitizen(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const startSession = async (phone: string, name: string) => {
    const r = await api.post<{ citizen: Citizen }>('/api/public/session/start', { phone, name, fp: fingerprint() });
    setCitizen(r.citizen);
    return r.citizen;
  };
  const logout = async () => {
    await api.post('/api/public/logout');
    setCitizen(null);
  };
  return <CitizenContext.Provider value={{ citizen, loading, refresh, startSession, logout }}>{children}</CitizenContext.Provider>;
}
export const useCitizen = () => useContext(CitizenContext);

// ------------------------------------------------------------- official session
export interface OfficialMeta {
  me: Official;
  categories: { code: string; group: string; name: string; emoji: string; dept: string; slaDays: number; sensitive: boolean }[];
  groups: { code: string; name: string }[];
  departments: { code: string; name: string; short: string }[];
  statuses: Record<string, { label: string; publicLabel: string; closed: boolean }>;
  transitions: Record<string, string[]>;
  reasonRequired: string[];
  wards: { code: string; name: string; corporation: string; zone: string; center: [number, number] }[];
}

interface OfficialCtx {
  official: Official | null;
  meta: OfficialMeta | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<Official>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
const OfficialContext = createContext<OfficialCtx>(null as any);

export function OfficialProvider({ children }: { children: ReactNode }) {
  const [official, setOfficial] = useState<Official | null>(null);
  const [meta, setMeta] = useState<OfficialMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const loadMeta = useCallback(async () => {
    const m = await api.get<OfficialMeta>('/api/official/meta');
    setMeta(m);
    setOfficial(m.me);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ official: Official | null }>('/api/auth/me');
      if (r.official) await loadMeta();
      else {
        setOfficial(null);
        setMeta(null);
      }
    } catch {
      setOfficial(null);
    } finally {
      setLoading(false);
    }
  }, [loadMeta]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const login = async (username: string, password: string) => {
    const r = await api.post<{ official: Official }>('/api/auth/login', { username, password });
    await loadMeta();
    return r.official;
  };
  const logout = async () => {
    await api.post('/api/auth/logout');
    setOfficial(null);
    setMeta(null);
  };
  return <OfficialContext.Provider value={{ official, meta, loading, login, logout, refresh }}>{children}</OfficialContext.Provider>;
}
export const useOfficial = () => useContext(OfficialContext);
