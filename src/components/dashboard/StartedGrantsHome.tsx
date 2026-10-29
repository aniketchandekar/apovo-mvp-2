'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FolderHeart,
  MessageCircle,
  RefreshCw,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { AppShell } from './AppShell';
import { StartApplicationButton } from '@/components/application-agent/StartApplicationButton';
import type { PatientProfile, StartedGrantSummary } from '@/lib/types';

function getGrantStatusMeta(item: StartedGrantSummary): {
  label: string;
  phaseDetail: string;
  tone: 'amber' | 'rose' | 'green' | 'slate';
} {
  const { application, latestRun, pendingQuestionsCount } = item;

  if (pendingQuestionsCount > 0 || latestRun?.state === 'waiting_for_patient' || application.state === 'NeedsPatientInput') {
    return {
      label: 'Action needed · Questions pending',
      phaseDetail:
        pendingQuestionsCount === 1
          ? 'Apovo paused on 1 question that requires your input.'
          : `Apovo paused on ${pendingQuestionsCount} questions that require your input.`,
      tone: 'amber',
    };
  }

  if (latestRun?.state === 'awaiting_patient_review' || application.state === 'AwaitingPatientApproval') {
    return {
      label: 'Ready for your signature & review',
      phaseDetail: 'All questions answered. Your unsigned PDF packet is assembled and ready to review.',
      tone: 'rose',
    };
  }

  if (latestRun?.state === 'packet_ready' || application.state === 'PacketReady') {
    return {
      label: 'Packet ready',
      phaseDetail: 'Your signed application packet is complete and ready for submission.',
      tone: 'green',
    };
  }

  if (application.state === 'Approved' || application.state === 'BenefitReceived') {
    return {
      label: application.state === 'BenefitReceived' ? 'Benefit received' : 'Approved',
      phaseDetail: 'This grant application has been approved by the foundation.',
      tone: 'green',
    };
  }

  if (application.state === 'Submitted' || application.state === 'AwaitingResponse' || application.state === 'FollowUpSent') {
    return {
      label: 'Submitted · Awaiting foundation reply',
      phaseDetail: 'Apovo is monitoring your Care Inbox for updates from the grant desk.',
      tone: 'slate',
    };
  }

  if (latestRun?.state === 'active') {
    const phaseMap: Record<string, string> = {
      created: 'Initializing Apovo application run…',
      launching_browser: 'Launching secure browser session…',
      inspecting_site: 'Inspecting grant website for official form…',
      downloading_pdf: 'Downloading official grant PDF application…',
      inspecting_pdf: 'Inspecting fillable PDF fields…',
      provisioning_care_email: 'Confirming your dedicated medical care email…',
      mapping_fields: 'Mapping your profile to application questions…',
      filling_pdf: 'Filling PDF form with your confirmed answers…',
      assembling_packet: 'Assembling your complete application packet…',
      applying_patient_signature: 'Applying your signature to the final packet…',
    };
    return {
      label: 'Apovo agent working',
      phaseDetail: phaseMap[latestRun.current_phase] || 'Apovo is actively preparing your application.',
      tone: 'rose',
    };
  }

  if (latestRun?.state === 'needs_manual_review' || latestRun?.state === 'failed') {
    return {
      label: 'Needs review in workspace',
      phaseDetail: latestRun.error_message || 'Open the application workspace to review or restart this run.',
      tone: 'amber',
    };
  }

  return {
    label: 'Application started',
    phaseDetail: 'Apovo has started preparing this grant application.',
    tone: 'slate',
  };
}

export function StartedGrantsHome() {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [startedGrants, setStartedGrants] = useState<StartedGrantSummary[]>([]);
  const [pendingItemsCount, setPendingItemsCount] = useState<number>(0);
  const [unreadEmailsCount, setUnreadEmailsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load dashboard');
      const data = await response.json();
      setPatient(data.patient || null);
      setStartedGrants(Array.isArray(data.startedGrants) ? data.startedGrants : []);
      setPendingItemsCount(typeof data.pendingItemsCount === 'number' ? data.pendingItemsCount : 0);
      setUnreadEmailsCount(typeof data.unreadEmailsCount === 'number' ? data.unreadEmailsCount : 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard().catch(console.error);
  }, [loadDashboard]);

  const hasActiveRun = useMemo(
    () => startedGrants.some((item) => item.latestRun?.state === 'active'),
    [startedGrants]
  );

  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = setInterval(() => {
      void loadDashboard();
    }, 3500);
    return () => clearInterval(timer);
  }, [hasActiveRun, loadDashboard]);

  const totalPendingQuestionsAcrossGrants = useMemo(
    () => startedGrants.reduce((sum, item) => sum + item.pendingQuestionsCount, 0),
    [startedGrants]
  );

  const totalAnsweredAcrossGrants = useMemo(
    () => startedGrants.reduce((sum, item) => sum + item.answeredQuestionsCount, 0),
    [startedGrants]
  );

  const patientName = patient?.first_name
    ? `${patient.first_name} ${patient.last_name || ''}`.trim()
    : 'Your profile';

  return (
    <AppShell
      patientName={patientName}
      careEmail={patient?.care_email}
      openTasksCount={pendingItemsCount}
      unreadEmailsCount={unreadEmailsCount}
      onRefreshData={() => void loadDashboard()}
    >
      <div className="home-container">
        {/* Top Header */}
        <div className="home-header">
          <div>
            <div className="home-eyebrow">Active Grant Applications</div>
            <h1>Grants started with Apovo</h1>
            <p>
              Track every grant application Apovo has started preparing for you, see how many
              questions are pending your input, and jump straight into your application workspace.
            </p>
          </div>
          <div className="home-header-actions">
            <button
              type="button"
              className="minimal-btn minimal-btn-secondary"
              onClick={() => void loadDashboard()}
              disabled={loading}
            >
              <RefreshCw size={15} />
              <span>Refresh</span>
            </button>
            <Link href="/talk" className="minimal-btn minimal-btn-secondary">
              <MessageCircle size={15} />
              <span>Talk with Apovo</span>
            </Link>
            <Link href="/resources" className="minimal-btn minimal-btn-rose">
              <FolderHeart size={15} />
              <span>Explore Grants</span>
            </Link>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="summary-strip" aria-label="Started grants summary">
          <div className="summary-tile">
            <span className="summary-label">Started Grants</span>
            <strong className="summary-value">{startedGrants.length}</strong>
            <span className="summary-sub">
              {startedGrants.length === 1
                ? '1 grant application in progress'
                : `${startedGrants.length} grant applications in progress`}
            </span>
          </div>

          <div className="summary-tile" data-highlight={totalPendingQuestionsAcrossGrants > 0}>
            <span className="summary-label">Pending Questions</span>
            <strong className="summary-value" data-amber={totalPendingQuestionsAcrossGrants > 0}>
              {totalPendingQuestionsAcrossGrants}
            </strong>
            <span className="summary-sub">
              {totalPendingQuestionsAcrossGrants === 0
                ? 'No questions waiting on you'
                : totalPendingQuestionsAcrossGrants === 1
                  ? '1 question needs your answer'
                  : `${totalPendingQuestionsAcrossGrants} questions need your answers`}
            </span>
          </div>

          <div className="summary-tile">
            <span className="summary-label">Questions Answered</span>
            <strong className="summary-value">{totalAnsweredAcrossGrants}</strong>
            <span className="summary-sub">Confirmed & mapped to your forms</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-home-card">
            <p>Loading your started grant applications…</p>
          </div>
        ) : startedGrants.length === 0 ? (
          <div className="empty-home-card">
            <div className="empty-icon-circle">
              <Sparkles size={24} />
            </div>
            <h2>No grant applications started yet</h2>
            <p>
              When you click <strong>Apply with Apovo</strong> on any program in{' '}
              <strong>My resource</strong>, it will appear here with its live preparation status and
              the exact count of pending questions awaiting your input.
            </p>
            <div className="empty-actions">
              <Link href="/resources" className="minimal-btn minimal-btn-rose">
                <FolderHeart size={16} />
                <span>Browse Grants in My Resource</span>
              </Link>
              <Link href="/talk" className="minimal-btn minimal-btn-secondary">
                <MessageCircle size={16} />
                <span>Talk with Apovo</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="started-grants-grid">
            {startedGrants.map((item) => {
              const {
                application,
                latestRun,
                pendingQuestionsCount,
                answeredQuestionsCount,
                totalQuestionsCount,
                pendingQuestions,
              } = item;
              const { resource } = application;
              const statusMeta = getGrantStatusMeta(item);
              const progressPercent =
                totalQuestionsCount > 0
                  ? Math.round((answeredQuestionsCount / totalQuestionsCount) * 100)
                  : latestRun?.state === 'packet_ready' ||
                      latestRun?.state === 'awaiting_patient_review'
                    ? 100
                    : 15;

              const workspaceHref = latestRun
                ? `/applications/${encodeURIComponent(application.id)}/workspace?run=${encodeURIComponent(latestRun.id)}`
                : null;

              return (
                <article className="started-grant-card" key={application.id}>
                  <div className="card-top">
                    <div className="card-meta-row">
                      <span className="resource-eyebrow">{resource.category}</span>
                      <span className="grant-amount-pill">{resource.est_value || 'Amount varies'}</span>
                    </div>

                    <h2>{resource.name}</h2>
                    <p className="resource-description">{resource.description}</p>

                    {/* Status Box inside the Card */}
                    <div className="card-status-box" data-tone={statusMeta.tone}>
                      <div className="status-box-header">
                        <div className="status-badge" data-tone={statusMeta.tone}>
                          <span className="status-dot" />
                          <span>{statusMeta.label}</span>
                        </div>

                        <div
                          className="pending-count-pill"
                          data-has-pending={pendingQuestionsCount > 0}
                        >
                          {pendingQuestionsCount > 0 ? (
                            <>
                              <AlertCircle size={13} />
                              <span>
                                {pendingQuestionsCount}{' '}
                                {pendingQuestionsCount === 1
                                  ? 'question pending'
                                  : 'questions pending'}
                              </span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={13} />
                              <span>0 questions pending</span>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="status-phase-detail">{statusMeta.phaseDetail}</p>

                      {totalQuestionsCount > 0 && (
                        <div className="question-progress">
                          <div className="question-progress-labels">
                            <span>Application questions</span>
                            <strong>
                              {answeredQuestionsCount} of {totalQuestionsCount} answered
                            </strong>
                          </div>
                          <div className="progress-track" aria-hidden="true">
                            <div
                              className="progress-fill"
                              style={{ width: `${Math.max(4, progressPercent)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {pendingQuestions.length > 0 && (
                        <div className="pending-preview-list">
                          <div className="pending-preview-heading">
                            <Clock size={12} />
                            <span>Next pending questions:</span>
                          </div>
                          <ul>
                            {pendingQuestions.slice(0, 2).map((q) => (
                              <li key={q.id}>{q.title}</li>
                            ))}
                            {pendingQuestions.length > 2 && (
                              <li className="more-questions">
                                +{pendingQuestions.length - 2} more pending{' '}
                                {pendingQuestions.length - 2 === 1 ? 'question' : 'questions'}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="card-actions">
                    {pendingQuestionsCount > 0 ? (
                      <>
                        <Link href="/tasks" className="minimal-btn minimal-btn-rose">
                          <ClipboardCheck size={15} />
                          <span>
                            Answer {pendingQuestionsCount} Pending{' '}
                            {pendingQuestionsCount === 1 ? 'Question' : 'Questions'}
                          </span>
                        </Link>
                        {workspaceHref && (
                          <Link href={workspaceHref} className="minimal-btn minimal-btn-secondary">
                            <span>Open Application Workspace</span>
                            <ArrowRight size={15} />
                          </Link>
                        )}
                      </>
                    ) : workspaceHref ? (
                      <Link href={workspaceHref} className="minimal-btn minimal-btn-rose">
                        <span>Open Application Workspace</span>
                        <ArrowRight size={15} />
                      </Link>
                    ) : (
                      <StartApplicationButton applicationId={application.id} />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .home-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .home-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }

        .home-eyebrow {
          color: var(--rose);
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 6px;
        }

        .home-header h1 {
          margin: 0 0 8px;
          font-size: 1.75rem;
          letter-spacing: -0.03em;
          line-height: 1.15;
        }

        .home-header p {
          margin: 0;
          color: var(--ink-muted);
          font-size: 0.94rem;
          line-height: 1.55;
          max-width: 640px;
        }

        .home-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .home-header-actions :global(a),
        .home-header-actions button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          text-decoration: none;
          min-height: 40px;
          padding: 0 15px;
          font-size: 0.85rem;
        }

        .summary-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .summary-tile {
          padding: 18px 20px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--paper);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .summary-tile[data-highlight='true'] {
          border-color: rgba(180, 82, 109, 0.4);
          background: rgba(180, 82, 109, 0.03);
        }

        .summary-label {
          font-size: 0.76rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--ink-muted);
        }

        .summary-value {
          font-size: 1.8rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: var(--ink);
          line-height: 1.15;
        }

        .summary-value[data-amber='true'] {
          color: var(--rose);
        }

        .summary-sub {
          font-size: 0.82rem;
          color: var(--ink-muted);
        }

        .empty-home-card {
          padding: 52px 28px;
          border: 1px dashed var(--line);
          border-radius: 14px;
          background: var(--paper);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .empty-icon-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(180, 82, 109, 0.1);
          color: var(--rose);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }

        .empty-home-card h2 {
          margin: 0;
          font-size: 1.25rem;
          letter-spacing: -0.02em;
        }

        .empty-home-card p {
          margin: 0;
          color: var(--ink-muted);
          font-size: 0.93rem;
          line-height: 1.6;
          max-width: 520px;
        }

        .empty-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .empty-actions :global(a) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          min-height: 42px;
          padding: 0 18px;
        }

        .started-grants-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
          align-items: stretch;
        }

        .started-grant-card {
          padding: 24px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--paper);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 22px;
        }

        .card-top {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .card-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .resource-eyebrow {
          color: var(--rose);
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .grant-amount-pill {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--ink);
          background: var(--surface-soft);
          border: 1px solid var(--line);
          padding: 4px 10px;
          border-radius: 999px;
        }

        .started-grant-card h2 {
          margin: 0;
          font-size: 1.4rem;
          line-height: 1.2;
          letter-spacing: -0.025em;
        }

        .resource-description {
          margin: 0;
          color: var(--ink-muted);
          font-size: 0.9rem;
          line-height: 1.55;
        }

        .card-status-box {
          margin-top: 4px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: var(--surface-soft);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .card-status-box[data-tone='amber'] {
          border-color: rgba(180, 82, 109, 0.35);
          background: rgba(180, 82, 109, 0.04);
        }

        .card-status-box[data-tone='green'] {
          border-color: rgba(23, 114, 69, 0.3);
          background: rgba(23, 114, 69, 0.04);
        }

        .status-box-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--ink);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--ink-muted);
        }

        .status-badge[data-tone='amber'] .status-dot,
        .status-badge[data-tone='rose'] .status-dot {
          background: var(--rose);
        }

        .status-badge[data-tone='green'] .status-dot {
          background: #177245;
        }

        .pending-count-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.76rem;
          font-weight: 600;
          background: rgba(23, 114, 69, 0.1);
          color: #177245;
        }

        .pending-count-pill[data-has-pending='true'] {
          background: rgba(180, 82, 109, 0.14);
          color: var(--rose);
        }

        .status-phase-detail {
          margin: 0;
          font-size: 0.84rem;
          color: var(--ink-muted);
          line-height: 1.45;
        }

        .question-progress {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .question-progress-labels {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.78rem;
          color: var(--ink-muted);
        }

        .question-progress-labels strong {
          color: var(--ink);
          font-weight: 600;
        }

        .progress-track {
          width: 100%;
          height: 6px;
          border-radius: 999px;
          background: rgba(32, 32, 31, 0.08);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          border-radius: 999px;
          background: var(--rose);
          transition: width 250ms ease;
        }

        .pending-preview-list {
          border-top: 1px solid var(--line);
          padding-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .pending-preview-heading {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--ink-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .pending-preview-list ul {
          margin: 0;
          padding-left: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .pending-preview-list li {
          font-size: 0.82rem;
          color: var(--ink);
          line-height: 1.4;
        }

        .pending-preview-list li.more-questions {
          color: var(--ink-muted);
          font-style: italic;
          list-style: none;
          margin-left: -16px;
        }

        .card-actions {
          display: grid;
          gap: 8px;
        }

        .card-actions :global(a) {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 42px;
          text-decoration: none;
          font-size: 0.88rem;
        }

        @media (max-width: 960px) {
          .started-grants-grid {
            grid-template-columns: 1fr;
          }
          .summary-strip {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 600px) {
          .home-container { gap: 20px; }
          .home-header { gap: 16px; }
          .home-header h1 { font-size: 1.5rem; text-wrap: balance; }
          .home-header p { font-size: .9rem; text-wrap: pretty; }
          .home-header-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }
          .home-header-actions :global(a), .home-header-actions button { min-height: 44px; justify-content: center; }
          .home-header-actions :global(a:last-child) { grid-column: 1 / -1; }
          .summary-strip {
            margin-right: -20px;
            padding-right: 20px;
            display: flex;
            gap: 12px;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scrollbar-width: none;
          }
          .summary-strip::-webkit-scrollbar { display: none; }
          .summary-tile { flex: 0 0 min(78vw, 270px); scroll-snap-align: start; }
          .started-grant-card { padding: 18px; }
          .status-box-header, .question-progress-labels { align-items: flex-start; flex-direction: column; }
          .card-actions :global(a) { min-height: 46px; }
          .empty-home-card { padding: 36px 18px; }
          .empty-actions { width: 100%; display: grid; }
        }
      `}</style>
    </AppShell>
  );
}
