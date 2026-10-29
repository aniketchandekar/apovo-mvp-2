'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTestMode } from '@/components/application-test/TestModeContext';
import { useDemoSession } from '@/components/demo/DemoSessionProvider';

export function StartApplicationButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const testMode = useTestMode();
  const demo = useDemoSession();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [modeConflict, setModeConflict] = useState(false);

  async function startApplication(restart = false) {
    setStarting(true);
    setError('');
    setModeConflict(false);
    try {
      const useDurableDemo = demo.available && applicationId.includes('remember-betty');
      if (useDurableDemo) {
        const response = await fetch('/api/demo/workflows/start', {
          method: 'POST',
          credentials: 'same-origin',
        });
        const payload = await response.json();
        if (payload.session) demo.syncSession(payload.session);
        if (!response.ok || !payload.runId || !payload.workspaceUrl) {
          throw new Error(payload.error || 'Apovo could not start this synthetic workflow.');
        }
        setStarting(false);
        router.push(payload.workspaceUrl);
        return;
      }

      const syntheticTest = testMode.enabled && applicationId.includes('remember-betty');
      const response = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testMode: syntheticTest, restart }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.runId || !payload.workspaceUrl) {
        if (response.status === 409 && payload.code === 'RUN_MODE_CONFLICT') {
          setModeConflict(true);
        }
        throw new Error(payload.error || 'Apovo could not start this application.');
      }
      setStarting(false);
      router.push(`${payload.workspaceUrl}?run=${encodeURIComponent(payload.runId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Apovo could not start this application.');
      setStarting(false);
    }
  }

  return (
    <div className="start-application">
      <button
        type="button"
        className="minimal-btn minimal-btn-rose"
        onClick={() => void startApplication()}
        disabled={starting || demo.loading || (demo.available && !demo.session?.active)}
      >
        {starting
          ? 'Opening workspace…'
          : demo.available && demo.session?.workflowBound
            ? 'Resume synthetic demo'
            : 'Apply with Apovo'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {modeConflict ? (
        <button
          type="button"
          className="minimal-btn minimal-btn-secondary restart-mode"
          disabled={starting}
          onClick={() => void startApplication(true)}
        >
          Start over in {testMode.enabled ? 'test' : 'normal'} mode
        </button>
      ) : null}
      <style jsx>{`
        .start-application { display: grid; gap: 8px; }
        button { width: 100%; min-height: 44px; }
        button:disabled { cursor: wait; opacity: 0.65; }
        p { margin: 0; color: #a33a3a; font-size: 0.78rem; line-height: 1.35; }
        .restart-mode { width: 100%; min-height: 38px; }
      `}</style>
    </div>
  );
}
