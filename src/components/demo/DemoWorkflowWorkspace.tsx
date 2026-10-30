'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  FlaskConical,
  ListChecks,
  Mail,
  RotateCcw,
  X,
} from 'lucide-react';
import { useDemoSession } from './DemoSessionProvider';
import { DemoWorkspaceViewer } from './DemoWorkspaceViewer';
import { useDemoWorkflow } from './useDemoWorkflow';

const STATUS_LABELS: Record<string, string> = {
  packet_ready: 'PDF ready',
  packet_ready_no_delivery: 'PDF ready · email already used',
  awaiting_approval: 'Ready for your approval',
  sending_email: 'Sending test email',
  email_sent: 'Test email sent',
  delivery_uncertain: 'Delivery uncertain',
  failed: 'Could not continue',
};

export function DemoWorkflowWorkspace({ runId }: { runId: string }) {
  const router = useRouter();
  const demo = useDemoSession();
  const workflow = useDemoWorkflow(runId);
  const [activityOpen, setActivityOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState('');
  const browserActive = ['browser_live', 'site_inspected'].includes(workflow.phase || '');
  const awaitingApproval = workflow.phase === 'awaiting_approval';
  const emailSpent = (demo.session?.remaining.emails || 0) === 0;
  const status = workflow.phase ? STATUS_LABELS[workflow.phase] || 'AI preparing packet' : 'Starting workflow';

  async function restartWorkflow() {
    setRestarting(true);
    setRestartError('');
    try {
      const response = await fetch(
        `/api/demo/workflows/${encodeURIComponent(runId)}/restart`,
        { method: 'POST', credentials: 'same-origin' }
      );
      const payload = (await response.json()) as {
        error?: string;
        runId?: string;
        workspaceUrl?: string;
        session?: Parameters<typeof demo.syncSession>[0];
      };
      if (payload.session) demo.syncSession(payload.session);
      if (!response.ok || !payload.runId || !payload.workspaceUrl) {
        throw new Error(payload.error || 'The synthetic workflow could not be restarted.');
      }
      router.push(payload.workspaceUrl);
    } catch (cause) {
      setRestartError(
        cause instanceof Error ? cause.message : 'The synthetic workflow could not be restarted.'
      );
      setRestarting(false);
    }
  }

  useEffect(() => {
    if (!activityOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActivityOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activityOpen]);

  return (
    <main className="demo-workspace">
      <header>
        <Link href="/resources" className="back-link"><ArrowLeft size={17} /> Back</Link>
        <div className="title">
          <strong>Remember Betty Foundation</strong>
          <span><FlaskConical size={12} /> Synthetic AI workflow</span>
        </div>
        <div className="header-actions">
          <span className="status"><i data-terminal={workflow.terminal} />{status}</span>
          <button
            type="button"
            className="restart-button"
            onClick={() => void restartWorkflow()}
            disabled={!workflow.terminal || !demo.session?.canRestartWorkflow || restarting}
            title={!workflow.terminal ? 'Finish this workflow before starting over' : undefined}
          >
            <RotateCcw size={13} /> {restarting ? 'Starting…' : 'Start over'}
          </button>
        </div>
      </header>
      {workflow.error ? <div className="workspace-error" role="alert">{workflow.error}</div> : null}
      {restartError ? <div className="workspace-error" role="alert">{restartError}</div> : null}
      <div className="workspace-body">
        {activityOpen ? <button type="button" className="activity-backdrop" aria-label="Close activity and actions" onClick={() => setActivityOpen(false)} /> : null}
        <aside className="activity" id="demo-activity" aria-label="Activity and actions" data-open={activityOpen}>
          <div className="activity-heading">
            <div>
              <span>Activity &amp; actions</span>
              <button type="button" className="close-activity" onClick={() => setActivityOpen(false)} aria-label="Close activity and actions"><X size={18} /></button>
            </div>
            <strong>AI is filling the application</strong>
            <p>Only the Ava Testperson fixture is used. No real patient data is read or stored.</p>
          </div>
          <ol>
            {workflow.indexedEvents.map(({ event, index }, position) => (
              <li key={`${runId}-${index}`}>
                <span className="event-icon">{position < workflow.indexedEvents.length - 1 || workflow.terminal ? <Check size={12} /> : <Circle size={9} />}</span>
                <div><strong>{event.phase.replaceAll('_', ' ')}</strong><p>{event.message}</p></div>
              </li>
            ))}
            {workflow.loading ? <li><span className="event-icon"><Circle size={9} /></span><div><strong>Starting</strong><p>Opening the durable workflow…</p></div></li> : null}
          </ol>
          {workflow.packet ? (
            <section className="approval-action" aria-labelledby="approval-heading">
              <span><Mail size={15} /> Test email action</span>
              <strong id="approval-heading">Review the filled PDF</strong>
              <p>Nothing is submitted to Remember Betty. The recipient is fixed on the server and cannot be edited.</p>
              {awaitingApproval ? (
                <button
                  type="button"
                  className="approve-button"
                  onClick={() => void workflow.approve()}
                  disabled={workflow.approving || emailSpent}
                >
                  <CheckCircle2 size={16} /> {workflow.approving ? 'Confirming…' : 'Confirm and send test email'}
                </button>
              ) : (
                <span className="approval-state">{emailSpent ? 'Email attempt used' : 'Waiting for the workflow…'}</span>
              )}
            </section>
          ) : null}
        </aside>
        <DemoWorkspaceViewer
          key={workflow.packet?.artifactId || 'browser'}
          runId={runId}
          packet={workflow.packet}
          browserActive={browserActive}
          liveViewUrl={workflow.liveViewUrl}
        />
        <button
          type="button"
          className="activity-toggle"
          aria-controls="demo-activity"
          aria-expanded={activityOpen}
          onClick={() => setActivityOpen(true)}
        >
          <ListChecks size={17} /> Activity &amp; actions
          {awaitingApproval ? <span aria-label="1 action required">1</span> : null}
        </button>
      </div>
      <style jsx>{`
        .demo-workspace { height: 100dvh; min-height: 680px; display: grid; grid-template-rows: 72px auto minmax(0, 1fr); overflow: hidden; background: #fff; color: #20201f; }
        header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; padding: 0 24px; border-bottom: 1px solid #e7e3df; }
        .back-link { display: inline-flex; align-items: center; gap: 7px; width: fit-content; min-height: 44px; color: #3d3b39; font-size: .8rem; text-decoration: none; }
        .title { display: grid; justify-items: center; gap: 3px; }
        .title strong { font-size: .91rem; }
        .title span { display: inline-flex; align-items: center; gap: 5px; color: #8b3524; font-size: .68rem; }
        .header-actions { justify-self: end; display: flex; align-items: center; gap: 10px; }
        .status { justify-self: end; display: inline-flex; align-items: center; gap: 7px; color: #5f5b57; font-size: .72rem; }
        .status i { width: 7px; height: 7px; border-radius: 50%; background: #177245; }
        .status i[data-terminal='true'] { background: #8b3524; }
        .restart-button { min-height: 34px; padding: 0 10px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #dedad5; border-radius: 7px; background: #fff; color: #4a4744; font: inherit; font-size: .7rem; cursor: pointer; }
        .restart-button:disabled { opacity: .5; cursor: not-allowed; }
        .workspace-error { padding: 9px 24px; border-bottom: 1px solid #efd3d0; background: #fff5f4; color: #8d302f; font-size: .78rem; }
        .workspace-body { position: relative; min-height: 0; display: grid; grid-template-columns: minmax(280px, 30%) minmax(0, 70%); }
        .activity { min-height: 0; overflow: auto; padding: 24px 20px; border-right: 1px solid #e7e3df; background: #fff; }
        .activity-heading { display: grid; gap: 5px; padding-bottom: 20px; border-bottom: 1px solid #ece8e4; }
        .activity-heading > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .activity-heading span { color: #8b3524; font-size: .67rem; font-weight: 700; }
        .activity-heading strong { font-size: .93rem; }
        .activity-heading p, li p, .approval-action p { margin: 0; color: #6f6b67; font-size: .73rem; line-height: 1.45; }
        .close-activity { display: none; }
        ol { margin: 0; padding: 18px 0 0; display: grid; gap: 17px; list-style: none; }
        li { display: grid; grid-template-columns: 24px 1fr; gap: 8px; }
        .event-icon { width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid #dfd9d3; border-radius: 50%; color: #177245; }
        li div { min-width: 0; display: grid; gap: 3px; }
        li strong { font-size: .72rem; text-transform: capitalize; }
        .approval-action { margin-top: 22px; padding: 14px; display: grid; gap: 6px; border: 1px solid #e2c5ba; border-radius: 10px; background: #fff8f4; }
        .approval-action > span:first-child { display: inline-flex; align-items: center; gap: 6px; color: #8b3524; font-size: .68rem; font-weight: 700; }
        .approval-action strong { font-size: .84rem; }
        .approve-button { min-height: 44px; margin-top: 6px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: 8px; background: #8b3524; color: #fff; font: inherit; font-size: .73rem; font-weight: 650; cursor: pointer; }
        .approve-button:disabled { opacity: .55; cursor: wait; }
        .approval-state { margin-top: 4px; color: #6f6b67; font-size: .72rem; }
        .activity-toggle, .activity-backdrop { display: none; }
        @media (max-width: 820px) {
          .demo-workspace { min-height: 100dvh; grid-template-rows: auto auto minmax(0, 1fr); }
          header { min-height: 72px; grid-template-columns: auto minmax(0, 1fr); gap: 8px 10px; padding: calc(8px + env(safe-area-inset-top)) 14px 8px; }
          .title { min-width: 0; justify-items: start; }
          .title strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .header-actions { grid-column: 1 / -1; justify-self: stretch; justify-content: space-between; }
          .status { justify-self: start; min-height: 24px; }
          .restart-button { min-height: 44px; }
          .workspace-body { grid-template-columns: minmax(0, 1fr); }
          .activity { position: fixed; z-index: 60; right: 0; bottom: 0; left: 0; width: 100%; max-height: min(74dvh, 650px); padding: 10px 16px calc(18px + env(safe-area-inset-bottom)); border: 0; border-radius: 18px 18px 0 0; box-shadow: 0 -12px 36px rgba(32,32,31,.18); transform: translateY(105%); transition: transform 180ms ease; }
          .activity[data-open='true'] { transform: translateY(0); }
          .activity-heading { padding-bottom: 14px; }
          .close-activity { width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: #3d3b39; cursor: pointer; }
          ol { gap: 13px; }
          .activity-backdrop { position: fixed; z-index: 50; inset: 0; display: block; border: 0; background: rgba(32,32,31,.34); }
          .activity-toggle { position: fixed; z-index: 40; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); min-height: 46px; padding: 0 13px; display: inline-flex; align-items: center; gap: 7px; border: 1px solid #cfc9c3; border-radius: 10px; background: #fff; color: #292725; box-shadow: 0 5px 18px rgba(32,32,31,.18); font: inherit; font-size: .75rem; font-weight: 650; cursor: pointer; }
          .activity-toggle span { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: #8b3524; color: #fff; font-size: .68rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .activity { transition: none; }
        }
      `}</style>
    </main>
  );
}
