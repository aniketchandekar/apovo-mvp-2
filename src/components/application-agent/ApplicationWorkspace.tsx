'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, RotateCcw, RotateCw, Square } from 'lucide-react';
import { ActivityRail } from './ActivityRail';
import { ApplicationWorkspaceViewer } from './ApplicationWorkspaceViewer';
import { useApplicationRun } from './useApplicationRun';
import { DemoWorkflowWorkspace } from '@/components/demo/DemoWorkflowWorkspace';

const STATUS_LABELS: Record<string, string> = {
  active: 'Working',
  waiting_for_patient: 'Needs your input',
  awaiting_patient_review: 'Ready for review',
  packet_ready: 'Packet ready',
  test_email_sent: 'Test email sent',
  needs_manual_review: 'Needs review',
  failed: 'Could not continue',
  stopped: 'Stopped',
};

export function ApplicationWorkspace({ runId, demo = false }: { runId: string; demo?: boolean }) {
  return demo
    ? <DemoWorkflowWorkspace key={`demo-${runId}`} runId={runId} />
    : <LegacyApplicationWorkspace key={`legacy-${runId}`} runId={runId} />;
}

function LegacyApplicationWorkspace({ runId }: { runId: string }) {
  const router = useRouter();
  const { run, events, workerActive, error, loading, resume, stop, refresh } = useApplicationRun(runId);
  const [startingOver, setStartingOver] = useState(false);
  const [startOverError, setStartOverError] = useState('');

  if (loading && !run) return <main className="workspace-message">Opening your application workspace…</main>;
  if (!run) return <main className="workspace-message"><p role="alert">{error || 'This application run is unavailable.'}</p><Link href="/resources">Back to resource</Link></main>;

  const canStop = run.state === 'active';
  const canResume = run.state === 'active' && !workerActive;

  async function leaveWorkspace() {
    if (run?.state === 'active') await stop();
    router.push('/resources');
  }

  async function startOver() {
    if (!run) return;
    setStartingOver(true);
    setStartOverError('');
    try {
      const response = await fetch(
        `/api/applications/${encodeURIComponent(run.application_id)}/runs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restart: true,
            testMode: run.delivery_mode === 'test_email',
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.runId || !payload.workspaceUrl) {
        throw new Error(payload.error || 'A new run could not be started.');
      }
      router.push(`${payload.workspaceUrl}?run=${encodeURIComponent(payload.runId)}`);
    } catch (cause) {
      setStartOverError(cause instanceof Error ? cause.message : 'A new run could not be started.');
      setStartingOver(false);
    }
  }

  const programTitle = run?.application_id.includes('hope-copay')
    ? 'Hope Oncology Copay Fund'
    : run?.application_id.includes('transit-voucher')
      ? 'Regional Transit Care Assistance'
      : run?.application_id.includes('cleaning-relief')
        ? 'Cleaning For A Reason'
        : run?.application_id.includes('pink-aid')
          ? 'Pink Aid Emergency Assistance'
          : 'Remember Betty Foundation';
  const isTestRun = run.delivery_mode === 'test_email';

  return (
    <main className="application-workspace">
      <header>
        <button type="button" className="back-link" onClick={() => void leaveWorkspace()}><ArrowLeft size={17} /> Back</button>
        <div className="grant-title">
          <strong>{programTitle}</strong>
          <span>{isTestRun ? 'Synthetic end-to-end test' : 'Application preparation'}</span>
        </div>
        <div className="workspace-actions">
          {isTestRun ? (
            <span className="test-run-badge" title={run.test_recipient}>
              TEST RUN · fake data · Nicole only
            </span>
          ) : null}
          <span className="run-status" data-state={run.state}><i />{STATUS_LABELS[run.state]}</span>
          {canResume ? <button type="button" onClick={() => void resume()}><RotateCw size={14} /> Resume</button> : null}
          {canStop ? <button type="button" onClick={() => void stop()}><Square size={12} /> Stop</button> : null}
          <button type="button" disabled={startingOver} onClick={() => void startOver()}><RotateCcw size={13} /> {startingOver ? 'Starting…' : 'Start over'}</button>
        </div>
      </header>
      {error ? <div className="workspace-error" role="alert">{error}</div> : null}
      {startOverError ? <div className="workspace-error" role="alert">{startOverError}</div> : null}
      <div className="workspace-body">
        <ActivityRail
          events={events}
          runState={run.state}
          workerActive={workerActive}
          runId={run.id}
          onCompleted={refresh}
        />
        <ApplicationWorkspaceViewer run={run} />
      </div>
      <style jsx>{`
        .application-workspace { height: 100dvh; min-height: 680px; display: grid; grid-template-rows: 72px auto minmax(0,1fr); overflow: hidden; background: #fff; color: #20201f; }
        header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px; padding: 0 24px; border-bottom: 1px solid #e7e3df; }
        .back-link { display: inline-flex; align-items: center; gap: 7px; width: fit-content; padding: 0; border: 0; background: transparent; color: #3d3b39; text-decoration: none; font-size: .83rem; font-weight: 500; cursor: pointer; }
        .grant-title { display: grid; justify-items: center; line-height: 1.25; }
        .grant-title strong { font-size: .92rem; }
        .grant-title span { color: #6f6b67; font-size: .7rem; }
        .workspace-actions { justify-self: end; display: flex; align-items: center; gap: 9px; }
        .run-status { display: inline-flex; align-items: center; gap: 7px; color: #5f5b57; font-size: .72rem; }
        .test-run-badge { padding: 5px 8px; border: 1px solid #d78b78; border-radius: 999px; background: #fff3ee; color: #8b3524; font-size: .62rem; font-weight: 700; letter-spacing: .03em; white-space: nowrap; }
        .run-status i { width: 7px; height: 7px; border-radius: 50%; background: #177245; }
        .run-status[data-state='failed'] i, .run-status[data-state='stopped'] i { background: #8d8985; }
        .run-status[data-state='needs_manual_review'] i { background: #9a5a12; }
        .workspace-actions button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 11px; border: 1px solid #dedad5; border-radius: 6px; background: #fff; color: #4a4744; font: inherit; font-size: .72rem; cursor: pointer; }
        .workspace-actions button:hover { border-color: #bcb7b1; }
        .workspace-error { padding: 9px 24px; color: #8d302f; background: #fff5f4; border-bottom: 1px solid #efd3d0; font-size: .78rem; }
        .workspace-body { min-height: 0; display: grid; grid-template-columns: minmax(280px, 30%) minmax(0, 70%); }
        @media (max-width: 820px) {
          .application-workspace { height: auto; min-height: 100dvh; grid-template-rows: auto auto auto; overflow: visible; }
          header { min-height: 0; grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: calc(10px + env(safe-area-inset-top)) 14px 10px; }
          .back-link { min-width: 44px; min-height: 44px; }
          .grant-title { min-width: 0; justify-items: start; }
          .grant-title strong, .grant-title span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .workspace-actions { grid-column: 1 / -1; justify-self: stretch; display: grid; grid-template-columns: auto 1fr 1fr; gap: 8px; }
          .run-status { min-height: 44px; }
          .test-run-badge { display: none; }
          .workspace-actions button { min-height: 44px; justify-content: center; }
          .workspace-body { grid-template-columns: 1fr; grid-template-rows: auto auto; }
        }
        @media (max-width: 420px) {
          .workspace-actions { grid-template-columns: 1fr 1fr; }
          .run-status { grid-column: 1 / -1; }
        }
      `}</style>
    </main>
  );
}
