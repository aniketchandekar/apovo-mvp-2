'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RequiredInput } from '@/lib/application-agent/types';

export function useRequiredInputs(runId: string, enabled: boolean) {
  const [inputs, setInputs] = useState<RequiredInput[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/application-runs/${encodeURIComponent(runId)}/inputs`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (response.ok && !cancelled) setInputs(payload.inputs as RequiredInput[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, runId, version]);

  const open = inputs.filter((input) => input.status === 'open');

  const submit = useCallback(
    async (request: () => Promise<Response>): Promise<boolean> => {
      setBusy(true);
      setError('');
      try {
        const response = await request();
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error || 'That answer could not be saved.');
          return false;
        }
        setVersion((current) => current + 1);
        return true;
      } catch {
        setError('The answer could not be saved. Check your connection and try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const answer = useCallback(
    (input: RequiredInput, value: string) =>
      submit(() =>
        fetch(
          `/api/application-runs/${encodeURIComponent(runId)}/inputs/${encodeURIComponent(input.id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer: value }),
          }
        )
      ),
    [runId, submit]
  );

  const upload = useCallback(
    (input: RequiredInput, file: File) =>
      submit(() => {
        const form = new FormData();
        form.set('inputId', input.id);
        form.set('file', file);
        return fetch(`/api/application-runs/${encodeURIComponent(runId)}/uploads`, {
          method: 'POST',
          body: form,
        });
      }),
    [runId, submit]
  );

  return {
    current: open[0] as RequiredInput | undefined,
    total: inputs.length,
    answeredCount: inputs.length - open.length,
    error,
    busy,
    answer,
    upload,
  };
}
