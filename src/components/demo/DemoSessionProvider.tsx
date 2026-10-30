'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PublicDemoSessionSummary } from '@/lib/demo-session/types';

interface DemoSessionContextValue {
  available: boolean;
  loading: boolean;
  session: PublicDemoSessionSummary | null;
  syncSession: (session: PublicDemoSessionSummary) => void;
  refresh: () => Promise<void>;
}

const DemoSessionContext = createContext<DemoSessionContextValue>({
  available: false,
  loading: true,
  session: null,
  syncSession: () => undefined,
  refresh: async () => undefined,
});

function validSummary(value: unknown): value is PublicDemoSessionSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<PublicDemoSessionSummary>;
  return (
    typeof summary.active === 'boolean' &&
    typeof summary.expiresAt === 'string' &&
    typeof summary.secondsRemaining === 'number' &&
    Boolean(summary.remaining) &&
    typeof summary.remaining?.chatTurns === 'number' &&
    typeof summary.canRestartWorkflow === 'boolean'
  );
}

export function DemoSessionProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<PublicDemoSessionSummary | null>(null);

  const syncSession = useCallback((next: PublicDemoSessionSummary) => {
    setAvailable(true);
    setSession(next);
  }, []);

  const load = useCallback(async (method: 'GET' | 'POST') => {
    try {
      const response = await fetch('/api/demo/session', {
        method,
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (response.status === 404) {
        setAvailable(false);
        setSession(null);
        return;
      }
      const payload = (await response.json()) as { session?: unknown };
      if (response.ok && validSummary(payload.session)) {
        syncSession(payload.session);
      } else {
        setAvailable(false);
        setSession(null);
      }
    } catch {
      setAvailable(false);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [syncSession]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/demo/session', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }: { response: Response; payload: { session?: unknown } }) => {
        if (response.status === 404) {
          setAvailable(false);
          setSession(null);
        } else if (response.ok && validSummary(payload.session)) {
          syncSession(payload.session);
        } else {
          setAvailable(false);
          setSession(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAvailable(false);
          setSession(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [syncSession]);

  useEffect(() => {
    if (!session?.active) return;
    const delay = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
    const timeout = window.setTimeout(() => {
      setSession((current) =>
        current ? { ...current, active: false, secondsRemaining: 0 } : current
      );
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [session?.active, session?.expiresAt]);

  const value = useMemo(
    () => ({
      available,
      loading,
      session,
      syncSession,
      refresh: () => load('GET'),
    }),
    [available, load, loading, session, syncSession]
  );

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession() {
  return useContext(DemoSessionContext);
}
