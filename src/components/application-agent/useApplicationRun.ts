'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApplicationRun, RunEvent } from '@/lib/application-agent/types';

type RunResponse = { run: ApplicationRun; isActive?: boolean };

export function useApplicationRun(runId: string) {
  const [run, setRun] = useState<ApplicationRun | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [workerActive, setWorkerActive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const cursor = useRef(0);
  const activeRunId = useRef(runId);

  const refresh = useCallback(async () => {
    const requestedRunId = runId;
    try {
      const [runResponse, eventResponse] = await Promise.all([
        fetch(`/api/application-runs/${encodeURIComponent(runId)}`, { cache: 'no-store' }),
        fetch(`/api/application-runs/${encodeURIComponent(runId)}/events?after=${cursor.current}`, {
          cache: 'no-store',
        }),
      ]);
      const runPayload = await runResponse.json();
      const eventPayload = await eventResponse.json();
      if (activeRunId.current !== requestedRunId) return;
      if (!runResponse.ok) throw new Error(runPayload.error || 'This application run is unavailable.');
      if (!eventResponse.ok) throw new Error(eventPayload.error || 'Activity could not be loaded.');

      const snapshot = runPayload as RunResponse;
      setRun(snapshot.run);
      setWorkerActive(Boolean(snapshot.isActive));
      setEvents((current) => {
        const known = new Set(current.map((event) => event.id));
        return [...current, ...(eventPayload.events as RunEvent[]).filter((event) => !known.has(event.id))]
          .sort((left, right) => left.sequence - right.sequence);
      });
      cursor.current = Math.max(cursor.current, eventPayload.lastSequence || 0);
      setError('');
    } catch (cause) {
      if (activeRunId.current !== requestedRunId) return;
      setError(cause instanceof Error ? cause.message : 'The application workspace is unavailable.');
    } finally {
      if (activeRunId.current === requestedRunId) setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    activeRunId.current = runId;
    cursor.current = 0;
    void refresh();
  }, [refresh, runId]);

  useEffect(() => {
    if (run?.state !== 'active') return;
    const interval = window.setInterval(() => void refresh(), 900);
    return () => window.clearInterval(interval);
  }, [refresh, run?.state]);

  useEffect(() => {
    if (run?.state !== 'active') return;
    const stopOnClose = () => {
      navigator.sendBeacon(`/api/application-runs/${encodeURIComponent(runId)}/stop`);
    };
    window.addEventListener('pagehide', stopOnClose);
    return () => window.removeEventListener('pagehide', stopOnClose);
  }, [run?.state, runId]);

  const control = useCallback(async (action: 'resume' | 'stop'): Promise<boolean> => {
    setError('');
    const response = await fetch(
      `/api/application-runs/${encodeURIComponent(runId)}/${action}`,
      { method: 'POST' }
    );
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || `The run could not ${action}.`);
      return false;
    }
    await refresh();
    return true;
  }, [refresh, runId]);

  return {
    run,
    events,
    workerActive,
    error,
    loading,
    refresh,
    resume: () => control('resume'),
    stop: () => control('stop'),
  };
}
