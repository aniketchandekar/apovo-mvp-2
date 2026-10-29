'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'apovo-remember-betty-test-mode';

interface TestModeContextValue {
  available: boolean;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const TestModeContext = createContext<TestModeContextValue>({
  available: false,
  enabled: false,
  setEnabled: () => undefined,
});

export function TestModeProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadCapability() {
      try {
        const response = await fetch('/api/capabilities', { cache: 'no-store' });
        const payload = (await response.json()) as { applicationTestMode?: boolean };
        if (!active || !response.ok) return;
        const isAvailable = payload.applicationTestMode === true;
        setAvailable(isAvailable);
        setEnabledState(isAvailable && window.sessionStorage.getItem(STORAGE_KEY) === '1');
      } catch {
        if (active) {
          setAvailable(false);
          setEnabledState(false);
        }
      }
    }
    void loadCapability();
    return () => {
      active = false;
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    const safeValue = available && next;
    setEnabledState(safeValue);
    window.sessionStorage.setItem(STORAGE_KEY, safeValue ? '1' : '0');
  }, [available]);

  const value = useMemo(
    () => ({ available, enabled: available && enabled, setEnabled }),
    [available, enabled, setEnabled]
  );

  return <TestModeContext.Provider value={value}>{children}</TestModeContext.Provider>;
}

export function useTestMode(): TestModeContextValue {
  return useContext(TestModeContext);
}
