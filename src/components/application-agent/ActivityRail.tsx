'use client';

import { useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import type { RunEvent, RunState } from '@/lib/application-agent/types';
import { PatientQuestion } from './PatientQuestion';

const ACTIVITY_LABELS: Record<RunState, string> = {
  active: 'Paused',
  waiting_for_patient: 'Waiting',
  awaiting_patient_review: 'Ready for review',
  packet_ready: 'Complete',
  test_email_sent: 'Email sent',
  needs_manual_review: 'Needs review',
  failed: 'Stopped',
  stopped: 'Stopped',
};

const CURRENT_STEP_LABELS: Record<RunState, string> = {
  active: 'Current',
  waiting_for_patient: 'Waiting',
  awaiting_patient_review: 'Ready for review',
  packet_ready: 'Complete',
  test_email_sent: 'Test email sent',
  needs_manual_review: 'Needs review',
  failed: 'Stopped',
  stopped: 'Stopped',
};

export function ActivityRail({
  events,
  runState,
  workerActive,
  runId,
  onCompleted,
}: {
  events: RunEvent[];
  runState: RunState;
  workerActive: boolean;
  runId: string;
  onCompleted: () => Promise<void> | void;
}) {
  const isLive = runState === 'active' && workerActive;
  const activityLabel = isLive ? 'Live' : ACTIVITY_LABELS[runState];
  const hasActions = runState === 'waiting_for_patient';
  const [selection, setSelection] = useState<{ tab: 'log' | 'actions'; hasActions: boolean } | null>(null);
  const tab = selection && selection.hasActions === hasActions
    ? selection.tab
    : hasActions ? 'actions' : 'log';

  return (
    <section className="activity-rail" aria-labelledby="activity-heading">
      <div className="activity-heading">
        <h2 id="activity-heading">What Apovo is doing</h2>
        <span data-state={runState} data-live={isLive} aria-label={`Activity status: ${activityLabel}`}>
          <i /> {activityLabel}
        </span>
      </div>
      <div className="rail-tabs" role="tablist" aria-label="Workspace sidebar">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'log'}
          data-active={tab === 'log'}
          onClick={() => setSelection({ tab: 'log', hasActions })}
        >
          Log
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'actions'}
          data-active={tab === 'actions'}
          data-attention={hasActions}
          onClick={() => setSelection({ tab: 'actions', hasActions })}
        >
          Actions required{hasActions ? <i aria-label="Action needed" /> : null}
        </button>
      </div>
      {tab === 'actions' ? (
        <div role="tabpanel" aria-label="Actions required">
          {hasActions ? (
            <PatientQuestion runId={runId} onCompleted={onCompleted} />
          ) : (
            <p className="actions-empty">Nothing is needed from you right now. Apovo will ask here when your input is required.</p>
          )}
        </div>
      ) : (
        <ol aria-live="polite" role="tabpanel" aria-label="Activity log">
          {events.map((event, index) => {
            const isCurrent = index === events.length - 1;
            const isWarning = event.kind === 'error' || event.kind === 'warning';
            const Icon = isCurrent && isWarning
              ? CircleAlert
              : isCurrent && isLive
                ? LoaderCircle
                : CircleCheck;
            const stepLabel = isCurrent
              ? (isLive ? 'Current' : CURRENT_STEP_LABELS[runState])
              : 'Complete';
            return (
              <li key={event.id} data-kind={event.kind} data-current={isCurrent}>
                <Icon className={isCurrent && isLive ? 'is-spinning' : undefined} size={16} aria-hidden="true" />
                <div>
                  <p>{event.public_message}</p>
                  <span>{stepLabel}</span>
                </div>
              </li>
            );
          })}
          {events.length === 0 ? <li className="empty">Activity will appear here as Apovo begins.</li> : null}
        </ol>
      )}
      <style jsx>{`
        .activity-rail { height: 100%; padding: 26px 24px; background: #f7f6f4; border-right: 1px solid #e7e3df; overflow: auto; }
        .activity-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
        h2 { font-size: 1rem; font-weight: 600; letter-spacing: -0.015em; }
        .activity-heading span { display: inline-flex; align-items: center; gap: 6px; color: #6f6b67; font-size: .72rem; }
        .activity-heading i { width: 7px; height: 7px; border-radius: 50%; background: #177245; box-shadow: 0 0 0 3px rgba(23,114,69,.1); }
        .activity-heading span:not([data-live='true']) i { background: #8d8985; box-shadow: none; }
        .activity-heading span[data-state='needs_manual_review'] i { background: #9a5a12; }
        .activity-heading span[data-state='packet_ready'] i { background: #177245; }
        .rail-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 3px; margin-bottom: 22px; border: 1px solid #e2deda; border-radius: 8px; background: #eeece9; }
        .rail-tabs button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; border: 0; border-radius: 6px; background: transparent; color: #6f6b67; font: inherit; font-size: .74rem; font-weight: 500; cursor: pointer; }
        .rail-tabs button[data-active='true'] { background: #fff; color: #2a2927; box-shadow: 0 1px 2px rgba(32,32,31,.08); }
        .rail-tabs button i { width: 6px; height: 6px; border-radius: 50%; background: #b4526d; }
        .actions-empty { color: #6f6b67; font-size: .84rem; line-height: 1.5; }
        ol { list-style: none; display: grid; gap: 0; padding: 0; margin: 0; }
        li { position: relative; display: grid; grid-template-columns: 18px 1fr; gap: 11px; min-height: 72px; color: #8d8985; }
        li:not(:last-child)::after { content: ''; position: absolute; left: 7px; top: 22px; bottom: 5px; border-left: 1px solid #d9d5d0; }
        li :global(svg) { margin-top: 2px; color: #b4526d; }
        li[data-kind='error'] :global(svg), li[data-kind='warning'] :global(svg) { color: #9a5a12; }
        li:not([data-current='true']) :global(svg), li[data-kind='complete'] :global(svg) { color: #177245; }
        li :global(.is-spinning) { animation: spin 1s linear infinite; }
        p { color: #2a2927; font-size: .86rem; line-height: 1.45; margin: 0 0 3px; }
        li span { font-size: .7rem; color: #8d8985; }
        .empty { display: block; color: #6f6b67; font-size: .86rem; line-height: 1.5; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { li :global(.is-spinning) { animation: none; } }
        @media (max-width: 820px) { .activity-rail { height: auto; max-height: none; padding: 20px 16px; border-right: 0; border-bottom: 1px solid #e7e3df; overflow: visible; } }
      `}</style>
    </section>
  );
}
