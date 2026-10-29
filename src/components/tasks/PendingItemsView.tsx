'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck,
  ShieldCheck,
  Send,
  Mail,
  FileText,
  Clock,
  Lock,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/dashboard/AppShell';
import type { AgentDraftRecord, PatientTask } from '@/lib/types';

type EnrichedPendingItem = PatientTask & { draft?: AgentDraftRecord };

interface TaskCounts {
  open: number;
  consent: number;
  data: number;
  completed: number;
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PendingItemsView() {
  const [activeTab, setActiveTab] = useState<'open' | 'consent' | 'data' | 'completed'>('open');
  const [items, setItems] = useState<EnrichedPendingItem[]>([]);
  const [counts, setCounts] = useState<TaskCounts>({
    open: 0,
    consent: 0,
    data: 0,
    completed: 0,
  });
  const [careEmail, setCareEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load pending items');
      setItems(data.tasks || []);
      if (data.counts) setCounts(data.counts);
      if (data.care_email) setCareEmail(data.care_email);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks().catch(console.error);
  }, [loadTasks]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'completed') {
      return items.filter((item) => item.status !== 'open');
    }
    const openOnly = items.filter((item) => item.status === 'open');
    if (activeTab === 'consent') {
      return openOnly.filter(
        (item) =>
          item.type === 'consent_reply' ||
          item.type === 'approve_followup' ||
          item.type === 'approve_submit' ||
          Boolean(item.draft_id)
      );
    }
    if (activeTab === 'data') {
      return openOnly.filter(
        (item) =>
          item.type !== 'consent_reply' &&
          item.type !== 'approve_followup' &&
          item.type !== 'approve_submit' &&
          !item.draft_id
      );
    }
    return openOnly;
  }, [items, activeTab]);

  return (
    <AppShell
      careEmail={careEmail || undefined}
      openTasksCount={counts.open}
      onRefreshData={() => void loadTasks()}
    >
      <div className="pending-hub">
        {/* Page Header */}
        <div className="pending-header">
          <div>
            <div className="pending-eyebrow">
              <ClipboardCheck size={15} /> Patient Control & Consent Queue
            </div>
            <h1>Pending items</h1>
            <p>
              Whenever a grant form requires additional data or an Apovo agent prepares an email
              reply or status follow-up from your medical ID, it pauses here for your answer and
              explicit consent.
            </p>
          </div>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void loadTasks()}
            disabled={loading}
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
        </div>

        {banner && (
          <div className={`pending-banner ${banner.type}`} role="status">
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="pending-tabs" role="tablist" aria-label="Pending item filters">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'open'}
            className={`pending-tab ${activeTab === 'open' ? 'active' : ''}`}
            onClick={() => setActiveTab('open')}
          >
            <span>All Pending</span>
            <span className="tab-count">{counts.open}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'consent'}
            className={`pending-tab ${activeTab === 'consent' ? 'active' : ''}`}
            onClick={() => setActiveTab('consent')}
          >
            <span>Email Consent & Follow-ups</span>
            <span className="tab-count">{counts.consent}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'data'}
            className={`pending-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            <span>Missing Form & Medical Data</span>
            <span className="tab-count">{counts.data}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'completed'}
            className={`pending-tab ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            <span>Completed History</span>
            <span className="tab-count">{counts.completed}</span>
          </button>
        </div>

        {/* Pending Items List */}
        {loading ? (
          <div className="empty-pending">Loading pending items…</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-pending">
            <CheckCircle2 size={28} style={{ color: '#177245', marginBottom: '8px' }} />
            <h2>All caught up in this queue</h2>
            <p>
              No pending questions or consent approvals require your attention right now. Your
              agents will notify you here whenever new information or email approval is needed.
            </p>
            <div className="empty-actions">
              <Link href="/inbox" className="minimal-btn minimal-btn-secondary">
                <Mail size={15} /> Open Care Email
              </Link>
              <Link href="/resources" className="minimal-btn minimal-btn-secondary">
                View Grant Resources
              </Link>
            </div>
          </div>
        ) : (
          <div className="pending-cards-list">
            {filteredItems.map((item) => (
              <PendingItemCard
                key={item.id}
                item={item}
                careEmail={careEmail}
                onResolved={(message) => {
                  setBanner({ type: 'success', text: message });
                  void loadTasks();
                }}
                onError={(message) => {
                  setBanner({ type: 'error', text: message });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .pending-hub {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 920px;
        }
        .pending-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }
        .pending-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--rose);
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 6px;
        }
        .pending-header h1 {
          font-size: 1.7rem;
          margin: 0 0 8px;
        }
        .pending-header p {
          font-size: 0.92rem;
          color: var(--ink-muted);
          max-width: 660px;
          margin: 0;
        }
        .refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 38px;
          padding: 0 14px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--paper);
          color: var(--ink);
          font: inherit;
          font-size: 0.82rem;
          cursor: pointer;
          flex-shrink: 0;
        }

        .pending-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.86rem;
          font-weight: 500;
        }
        .pending-banner.success {
          background: #eef8f2;
          border: 1px solid #bfe3cd;
          color: #177245;
        }
        .pending-banner.error {
          background: #fff5f4;
          border: 1px solid #efd3d0;
          color: #8d302f;
        }
        .pending-banner button {
          background: none;
          border: none;
          cursor: pointer;
          color: inherit;
        }

        .pending-tabs {
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid var(--line);
          overflow-x: auto;
        }
        .pending-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 16px;
          border: none;
          border-bottom: 2px solid transparent;
          background: transparent;
          color: var(--ink-muted);
          font: inherit;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
        }
        .pending-tab.active {
          color: var(--rose);
          border-bottom-color: var(--rose);
          font-weight: 600;
        }
        .tab-count {
          font-size: 0.72rem;
          padding: 1px 7px;
          border-radius: 999px;
          background: var(--surface-soft);
          color: var(--ink-muted);
        }
        .pending-tab.active .tab-count {
          background: rgba(180, 82, 109, 0.14);
          color: var(--rose);
        }

        .empty-pending {
          padding: 56px 28px;
          border: 1px dashed var(--line);
          border-radius: 12px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .empty-pending h2 {
          font-size: 1.15rem;
          margin-bottom: 6px;
        }
        .empty-pending p {
          font-size: 0.88rem;
          max-width: 460px;
          margin-bottom: 18px;
        }
        .empty-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .pending-cards-list {
          display: grid;
          gap: 16px;
        }
        @media (max-width: 600px) {
          .pending-hub { gap: 16px; }
          .pending-header { display: grid; grid-template-columns: 1fr auto; gap: 12px; }
          .pending-eyebrow { font-size: .7rem; }
          .pending-header h1 { font-size: 1.5rem; }
          .pending-header p { grid-column: 1 / -1; font-size: .88rem; text-wrap: pretty; }
          .refresh-btn { width: 44px; height: 44px; padding: 0; justify-content: center; }
          .refresh-btn span { display: none; }
          .pending-tabs { margin-right: -20px; padding-right: 20px; scrollbar-width: none; }
          .pending-tabs::-webkit-scrollbar { display: none; }
          .pending-tab { min-height: 44px; padding-inline: 12px; }
          .empty-pending { padding: 40px 18px; }
          .empty-actions { width: 100%; display: grid; }
        }
      `}</style>
    </AppShell>
  );
}

function PendingItemCard({
  item,
  careEmail,
  onResolved,
  onError,
}: {
  item: EnrichedPendingItem;
  careEmail: string | null;
  onResolved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isConsentType =
    item.type === 'consent_reply' ||
    item.type === 'approve_followup' ||
    Boolean(item.draft);

  const [value, setValue] = useState<string>('');
  const [draftText, setDraftText] = useState<string>(item.draft?.text || '');
  const [consentChecked, setConsentChecked] = useState<boolean>(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  async function handleAnswer(overrideValue?: string) {
    setBusy(true);
    try {
      // Handle file upload for active PDF ApplicationRun RequiredInput
      if (item.type === 'file' && item.run_id && item.id.startsWith('input_')) {
        if (!file) {
          onError('Please choose a PDF file to upload.');
          setBusy(false);
          return;
        }
        const formData = new FormData();
        formData.set('inputId', item.id);
        formData.set('file', file);
        const res = await fetch(
          `/api/application-runs/${encodeURIComponent(item.run_id)}/uploads`,
          {
            method: 'POST',
            body: formData,
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed.');
        onResolved('Document uploaded and application packet resumed.');
        return;
      }

      // Handle general file upload for PatientTask
      let uploadedFilePayload: { fileId: string; filename: string; url: string } | undefined;
      if (item.type === 'file' && file) {
        const formData = new FormData();
        formData.set('file', file);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Document upload failed.');
        uploadedFilePayload = {
          fileId: uploadData.fileId || `file_${file.name}`,
          filename: file.name,
          url: uploadData.url || '',
        };
      }

      const finalAnswer = overrideValue ?? value;
      const res = await fetch(`/api/tasks/${encodeURIComponent(item.id)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: finalAnswer,
          answer: uploadedFilePayload || finalAnswer,
          run_id: item.run_id,
          draft_text: isConsentType ? draftText : undefined,
          sendWithConsent: isConsentType ? consentChecked : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not complete item.');
      onResolved(data.message || 'Item completed.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (item.id.startsWith('input_')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(item.id)}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Skipped by patient from Pending items' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not skip item.');
      onResolved('Item skipped.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Skip failed.');
    } finally {
      setBusy(false);
    }
  }

  const badgeLabel =
    item.source_kind === 'followup_agent'
      ? 'Follow-up Agent'
      : item.source_kind === 'email_agent'
      ? 'Inbox Agent'
      : 'Form Agent';

  return (
    <article className={`pending-card ${item.status !== 'open' ? 'resolved' : ''}`}>
      <div className="card-top-row">
        <div className="card-asker">
          <span className="program-pill">{item.program_name}</span>
          <span className="agent-pill">{badgeLabel}</span>
          <span className="time-label">· {formatRelativeTime(item.created_at)}</span>
        </div>

        <div className="card-context-links">
          {item.deadline && (
            <span className="deadline-tag">
              <Clock size={12} /> Due {item.deadline}
            </span>
          )}
          {item.thread_id && (
            <Link
              href={`/inbox?thread=${encodeURIComponent(item.thread_id)}`}
              className="context-link"
            >
              <Mail size={13} /> Open Email Thread <ArrowRight size={12} />
            </Link>
          )}
          {item.run_id && item.application_id && (
            <Link
              href={`/applications/${encodeURIComponent(
                item.application_id
              )}/workspace?run=${encodeURIComponent(item.run_id)}`}
              className="context-link"
            >
              <FileText size={13} /> Open Form Workspace <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </div>

      <div className="card-question-body">
        <h3>{item.title}</h3>
        <p className="why-text">{item.why}</p>
      </div>

      {item.status !== 'open' ? (
        <div className="resolved-summary">
          <CheckCircle2 size={15} />
          <span>
            {item.status === 'answered'
              ? `Completed ${formatRelativeTime(item.answered_at)}`
              : 'Skipped'}
          </span>
        </div>
      ) : (
        <div className="card-interactive-area">
          {/* If this task is an AgentMail Draft / Email Reply requiring User Consent */}
          {isConsentType && (
            <div className="draft-preview-box">
              <div className="draft-preview-header">
                <span>
                  <ShieldCheck size={14} /> Staged AgentMail Message Preview
                </span>
                {item.draft?.draft_id && <code>ID: {item.draft.draft_id}</code>}
              </div>

              <div className="draft-preview-meta">
                <div>
                  <strong>From:</strong> <code>{careEmail || item.draft?.inbox_id}</code>
                </div>
                {item.draft?.to && item.draft.to.length > 0 && (
                  <div>
                    <strong>To:</strong> <code>{item.draft.to.join(', ')}</code>
                  </div>
                )}
                {item.draft?.subject && (
                  <div>
                    <strong>Subject:</strong> {item.draft.subject}
                  </div>
                )}
              </div>

              {item.type !== 'approve_followup' && (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Optional: Add specific details or verification answer to include in the reply…"
                  className="task-text-input"
                />
              )}

              <textarea
                rows={4}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Write or review the email reply text that will be sent via AgentMail…"
                className="task-textarea"
              />

              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <span>
                  I give consent for Apovo to send this email on my behalf from my Care Inbox.
                </span>
              </label>
            </div>
          )}

          {/* Data / Document Inputs when not a pure email consent card */}
          {!isConsentType && (
            <div className="data-input-box">
              {item.type === 'choice' && item.options ? (
                <div className="choice-chips">
                  {item.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={busy}
                      className="choice-chip-btn"
                      onClick={() => void handleAnswer(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : item.type === 'file' ? (
                <input
                  type="file"
                  accept="application/pdf,.pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="task-file-input"
                />
              ) : item.type === 'personal_note' ? (
                <textarea
                  rows={5}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Write in your own words. Only you can approve what is included."
                  className="task-textarea"
                />
              ) : (
                <input
                  type={
                    item.type === 'date'
                      ? 'date'
                      : item.type === 'sensitive_text'
                      ? 'password'
                      : 'text'
                  }
                  maxLength={item.type === 'sensitive_text' ? 4 : undefined}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter your answer…"
                  className="task-text-input"
                />
              )}
            </div>
          )}

          {/* Footer with Privacy Line & Action Buttons */}
          <div className="card-footer">
            <div className="privacy-line">
              <Lock size={13} />
              <span>Shared only with {item.shared_with}</span>
            </div>

            <div className="card-actions">
              {!item.id.startsWith('input_') && (
                <button
                  type="button"
                  className="minimal-btn minimal-btn-ghost"
                  disabled={busy}
                  onClick={() => void handleSkip()}
                >
                  Skip
                </button>
              )}

              {item.type !== 'choice' && (
                <button
                  type="button"
                  className="minimal-btn minimal-btn-rose"
                  disabled={
                    busy ||
                    (isConsentType && !consentChecked) ||
                    (!isConsentType && item.type === 'file' && !file) ||
                    (!isConsentType && item.type !== 'file' && !value.trim())
                  }
                  onClick={() => void handleAnswer()}
                >
                  {isConsentType ? (
                    <>
                      <Send size={14} />
                      <span>{busy ? 'Sending…' : 'Consent & Send Email'}</span>
                    </>
                  ) : (
                    <span>{busy ? 'Saving…' : 'Save & Continue Agent'}</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .pending-card {
          padding: 22px 24px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--paper);
          display: grid;
          gap: 14px;
        }
        .pending-card.resolved {
          background: var(--surface-soft);
          opacity: 0.85;
        }
        .card-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .card-asker {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .program-pill {
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--rose);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .agent-pill {
          font-size: 0.73rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--surface-soft);
          border: 1px solid var(--line);
          color: var(--ink-muted);
        }
        .time-label {
          font-size: 0.76rem;
          color: var(--ink-muted);
        }
        .card-context-links {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .deadline-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.74rem;
          font-weight: 600;
          color: #9a5a12;
          background: #fff8eb;
          border: 1px solid #f0d9b5;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .context-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--rose);
          text-decoration: none;
        }

        .card-question-body h3 {
          font-size: 1.08rem;
          margin: 0 0 4px;
        }
        .why-text {
          font-size: 0.86rem;
          color: var(--ink-muted);
          margin: 0;
        }

        .resolved-summary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          font-weight: 600;
          color: #177245;
        }

        .card-interactive-area {
          display: grid;
          gap: 14px;
        }

        .draft-preview-box {
          padding: 14px 16px;
          border-radius: 8px;
          background: var(--surface-soft);
          border: 1px solid var(--line);
          display: grid;
          gap: 10px;
        }
        .draft-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--rose);
        }
        .draft-preview-header span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .draft-preview-meta {
          font-size: 0.78rem;
          color: var(--ink-muted);
          display: grid;
          gap: 3px;
        }

        .task-text-input,
        .task-textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--line);
          border-radius: 8px;
          font: inherit;
          font-size: 0.88rem;
          background: var(--paper);
          color: var(--ink);
        }
        .task-file-input {
          font-size: 0.84rem;
        }

        .choice-chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .choice-chip-btn {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--rose);
          background: var(--paper);
          color: var(--rose);
          font: inherit;
          font-size: 0.84rem;
          font-weight: 500;
          cursor: pointer;
        }
        .choice-chip-btn:hover:not(:disabled) {
          background: var(--rose);
          color: var(--paper);
        }

        .consent-check {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.8rem;
          color: var(--ink);
          cursor: pointer;
        }
        .consent-check input {
          margin-top: 3px;
        }

        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding-top: 10px;
          border-top: 1px solid var(--line);
          flex-wrap: wrap;
        }
        .privacy-line {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          color: var(--ink-muted);
        }
        .card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        @media (max-width: 600px) {
          .pending-card { padding: 18px 16px; }
          .card-top-row, .card-footer { align-items: stretch; flex-direction: column; }
          .card-context-links { gap: 8px; }
          .context-link, .deadline-tag { min-height: 36px; }
          .draft-preview-box { padding: 12px; }
          .draft-preview-header { align-items: flex-start; flex-direction: column; gap: 6px; }
          .draft-preview-header code, .draft-preview-meta code { overflow-wrap: anywhere; }
          .task-text-input, .task-textarea { padding: 12px; }
          .choice-chip-btn { min-height: 44px; }
          .consent-check { gap: 12px; font-size: .86rem; }
          .consent-check input { width: 20px; height: 20px; }
          .card-actions { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr); }
          .card-actions button { min-height: 46px; }
          .card-actions button:last-child { width: 100%; justify-content: center; }
        }
      `}</style>
    </article>
  );
}
