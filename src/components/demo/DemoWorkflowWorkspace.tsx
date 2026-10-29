'use client';

import Link from 'next/link';
import { ArrowLeft, Check, Circle, FlaskConical } from 'lucide-react';
import { LiveBrowserPanel } from '@/components/application-agent/LiveBrowserPanel';
import { useDemoSession } from './DemoSessionProvider';
import { DemoPacketPreview } from './DemoPacketPreview';
import { useDemoWorkflow } from './useDemoWorkflow';

const STATUS_LABELS: Record<string, string> = {
  awaiting_approval: 'Ready for your approval',
  sending_email: 'Sending test email',
  email_sent: 'Test email sent',
  delivery_uncertain: 'Delivery uncertain',
  failed: 'Could not continue',
};

export function DemoWorkflowWorkspace({ runId }: { runId: string }) {
  const demo = useDemoSession();
  const workflow = useDemoWorkflow(runId);
  const browserActive = ['browser_live', 'site_inspected'].includes(workflow.phase || '');
  const status = workflow.phase ? STATUS_LABELS[workflow.phase] || 'AI preparing packet' : 'Starting workflow';

  return (
    <main className="demo-workspace">
      <header>
        <Link href="/resources" className="back-link"><ArrowLeft size={17} /> Back</Link>
        <div className="title">
          <strong>Remember Betty Foundation</strong>
          <span><FlaskConical size={12} /> Synthetic AI workflow</span>
        </div>
        <span className="status"><i data-terminal={workflow.terminal} />{status}</span>
      </header>
      {workflow.error ? <div className="workspace-error" role="alert">{workflow.error}</div> : null}
      <div className="workspace-body">
        <aside className="activity" aria-label="AI workflow activity">
          <div className="activity-heading">
            <span>Workflow</span>
            <strong>AI is filling the application</strong>
            <p>Only the Ava Testperson fixture is used. No real patient data is read or stored.</p>
          </div>
          <ol>
            {workflow.events.map((event, index) => (
              <li key={`${event.phase}-${event.message}`}>
                <span className="event-icon">{index < workflow.events.length - 1 || workflow.terminal ? <Check size={12} /> : <Circle size={9} />}</span>
                <div><strong>{event.phase.replaceAll('_', ' ')}</strong><p>{event.message}</p></div>
              </li>
            ))}
            {workflow.loading ? <li><span className="event-icon"><Circle size={9} /></span><div><strong>Starting</strong><p>Opening the durable workflow…</p></div></li> : null}
          </ol>
        </aside>
        {workflow.packet ? (
          <DemoPacketPreview
            packet={workflow.packet}
            awaitingApproval={workflow.phase === 'awaiting_approval'}
            approving={workflow.approving}
            emailSpent={(demo.session?.remaining.emails || 0) === 0}
            onApprove={workflow.approve}
          />
        ) : (
          <LiveBrowserPanel
            run={{
              state: browserActive ? 'active' : 'packet_ready',
              current_phase: browserActive ? 'inspecting_site' : 'inspecting_pdf',
              live_view_url: browserActive ? workflow.liveViewUrl : undefined,
            }}
          />
        )}
      </div>
      <style jsx>{`
        .demo-workspace { height: 100dvh; min-height: 680px; display: grid; grid-template-rows: 72px auto minmax(0, 1fr); overflow: hidden; background: #fff; color: #20201f; }
        header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; padding: 0 24px; border-bottom: 1px solid #e7e3df; }
        .back-link { display: inline-flex; align-items: center; gap: 7px; width: fit-content; min-height: 44px; color: #3d3b39; font-size: .8rem; text-decoration: none; }
        .title { display: grid; justify-items: center; gap: 3px; }
        .title strong { font-size: .91rem; }
        .title span { display: inline-flex; align-items: center; gap: 5px; color: #8b3524; font-size: .68rem; }
        .status { justify-self: end; display: inline-flex; align-items: center; gap: 7px; color: #5f5b57; font-size: .72rem; }
        .status i { width: 7px; height: 7px; border-radius: 50%; background: #177245; }
        .status i[data-terminal='true'] { background: #8b3524; }
        .workspace-error { padding: 9px 24px; border-bottom: 1px solid #efd3d0; background: #fff5f4; color: #8d302f; font-size: .78rem; }
        .workspace-body { min-height: 0; display: grid; grid-template-columns: minmax(270px, 30%) minmax(0, 70%); }
        .activity { min-height: 0; overflow: auto; padding: 24px 20px; border-right: 1px solid #e7e3df; background: #fff; }
        .activity-heading { display: grid; gap: 5px; padding-bottom: 20px; border-bottom: 1px solid #ece8e4; }
        .activity-heading span { color: #8b3524; font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        .activity-heading strong { font-size: .93rem; }
        .activity-heading p, li p { margin: 0; color: #6f6b67; font-size: .73rem; line-height: 1.45; }
        ol { margin: 0; padding: 18px 0 0; display: grid; gap: 17px; list-style: none; }
        li { display: grid; grid-template-columns: 24px 1fr; gap: 8px; }
        .event-icon { width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid #dfd9d3; border-radius: 50%; color: #177245; }
        li div { min-width: 0; display: grid; gap: 3px; }
        li strong { font-size: .72rem; text-transform: capitalize; }
        @media (max-width: 820px) {
          .demo-workspace { height: auto; min-height: 100dvh; grid-template-rows: auto auto auto; overflow: visible; }
          header { min-height: 72px; grid-template-columns: auto minmax(0, 1fr); gap: 10px; padding: calc(8px + env(safe-area-inset-top)) 14px 8px; }
          .title { min-width: 0; justify-items: start; }
          .title strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .status { grid-column: 1 / -1; justify-self: start; min-height: 30px; }
          .workspace-body { grid-template-columns: 1fr; }
          .activity { max-height: 38dvh; padding: 18px 14px; border-right: 0; border-bottom: 1px solid #e7e3df; }
          ol { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
        }
      `}</style>
    </main>
  );
}
