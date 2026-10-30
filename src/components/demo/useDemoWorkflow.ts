'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DemoWorkflowEvent, DemoWorkflowPhase } from '@/lib/demo-workflow/types';
import type { PublicDemoSessionSummary } from '@/lib/demo-session/types';
import { useDemoSession } from './DemoSessionProvider';

const TERMINAL_PHASES = new Set<DemoWorkflowPhase>([
  'packet_ready_no_delivery',
  'email_sent',
  'delivery_uncertain',
  'failed',
]);

function isDemoWorkflowEvent(value: unknown): value is DemoWorkflowEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<DemoWorkflowEvent>;
  return typeof event.phase === 'string' && typeof event.message === 'string';
}

interface IndexedDemoWorkflowEvent {
  index: number;
  event: DemoWorkflowEvent;
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

export function useDemoWorkflow(runId: string) {
  const demo = useDemoSession();
  const [indexedEvents, setIndexedEvents] = useState<IndexedDemoWorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function connect() {
      let reconnects = 0;
      let nextStartIndex = 0;
      const expiresAt = demo.session?.expiresAt
        ? new Date(demo.session.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      while (!controller.signal.aborted) {
        if (Date.now() >= expiresAt) {
          setError('This demo session expired. Start a new session to continue.');
          setLoading(false);
          return;
        }
        try {
          const response = await fetch(
            `/api/demo/workflows/${encodeURIComponent(runId)}/events?startIndex=${nextStartIndex}`,
            { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }
          );
          if (!response.ok || !response.body) {
            throw new Error(await errorMessage(response, 'Workflow activity could not be loaded.'));
          }

          setLoading(false);
          setError('');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let terminal = false;

          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.trim()) continue;
              const parsed: unknown = JSON.parse(line);
              if (!isDemoWorkflowEvent(parsed)) continue;
              const index = nextStartIndex;
              nextStartIndex += 1;
              terminal = terminal || TERMINAL_PHASES.has(parsed.phase);
              if (controller.signal.aborted) return;
              setIndexedEvents((current) => {
                return current.some((item) => item.index === index)
                  ? current
                  : [...current, { index, event: parsed }];
              });
            }
            if (done) break;
          }

          if (terminal || controller.signal.aborted) return;
          reconnects += 1;
        } catch (cause) {
          if (controller.signal.aborted) return;
          reconnects += 1;
          if (reconnects > 3) {
            setError(
              cause instanceof Error
                ? `${cause.message} Retrying…`
                : 'Workflow activity is temporarily unavailable. Retrying…'
            );
            setLoading(false);
          }
        }
        const delay = Math.min(10_000, 800 * 2 ** Math.min(reconnects, 4));
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }

    void connect();
    return () => controller.abort();
  }, [demo.session?.expiresAt, runId]);

  const approve = useCallback(async () => {
    setApproving(true);
    setError('');
    try {
      const response = await fetch(
        `/api/demo/workflows/${encodeURIComponent(runId)}/approve`,
        { method: 'POST', credentials: 'same-origin' }
      );
      const payload = (await response.json()) as {
        accepted?: boolean;
        error?: string;
        session?: PublicDemoSessionSummary;
      };
      if (payload.session) demo.syncSession(payload.session);
      if (!response.ok || !payload.accepted) {
        throw new Error(payload.error || 'The test email could not be approved.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The test email could not be approved.');
    } finally {
      setApproving(false);
    }
  }, [demo, runId]);

  const events = useMemo(() => indexedEvents.map((item) => item.event), [indexedEvents]);
  const phase = events.at(-1)?.phase;
  const packet = useMemo(
    () => [...events].reverse().find((event) => Boolean(event.packet))?.packet,
    [events]
  );
  const liveViewUrl = useMemo(
    () => [...events].reverse().find((event) => Boolean(event.liveViewUrl))?.liveViewUrl,
    [events]
  );

  return {
    events,
    indexedEvents,
    loading,
    error,
    approving,
    approve,
    phase,
    packet,
    liveViewUrl,
    terminal: phase ? TERMINAL_PHASES.has(phase) : false,
  };
}
