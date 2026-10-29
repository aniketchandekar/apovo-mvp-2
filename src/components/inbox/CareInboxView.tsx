'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Star,
  Send,
  FileEdit,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Mail,
  ArrowUpRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  MailOpen,
  ShieldCheck,
  Plus,
  X,
  ArrowLeft,
} from 'lucide-react';
import { AppShell } from '@/components/dashboard/AppShell';
import type {
  AgentDraftRecord,
  ApplicationRecord,
  EmailClassification,
  EmailRecord,
  FollowUpConfig,
  PatientTask,
} from '@/lib/types';

interface ThreadListItemData {
  thread_id: string;
  latest: EmailRecord;
  messages: EmailRecord[];
  messageCount: number;
  unreadCount: number;
  starred: boolean;
  program_name: string;
  subject: string;
  pendingDraft: AgentDraftRecord | null;
  openTask: PatientTask | null;
  hasOutbound: boolean;
  hasInbound?: boolean;
  isOutboundOnly?: boolean;
}

interface ThreadDetailPayload {
  thread_id: string;
  program_name: string;
  subject: string;
  latest: EmailRecord | null;
  messages: EmailRecord[];
  application: ApplicationRecord | null;
  followUpConfig: FollowUpConfig | null;
  task: PatientTask | null;
  draft: AgentDraftRecord | null;
}

interface InboxCounts {
  inbox: number;
  all: number;
  needs_you: number;
  waiting: number;
  done: number;
  drafts: number;
  sent: number;
  starred: number;
  unread: number;
}

const CLASSIFICATION_META: Record<
  EmailClassification,
  { label: string; color: string; bg: string; border: string }
> = {
  needs_info: {
    label: 'Action / Info Needed',
    color: '#9a5a12',
    bg: '#fff8eb',
    border: '#f0d9b5',
  },
  confirmation: {
    label: 'Confirmed',
    color: '#3d5a80',
    bg: '#f2f6fa',
    border: '#d0dfed',
  },
  pending: {
    label: 'Awaiting Reply',
    color: '#5f5b57',
    bg: '#f7f6f4',
    border: '#e7e3df',
  },
  approved: {
    label: 'Approved',
    color: '#177245',
    bg: '#eef8f2',
    border: '#bfe3cd',
  },
  benefit_delivered: {
    label: 'Benefit Delivered',
    color: '#177245',
    bg: '#eef8f2',
    border: '#bfe3cd',
  },
  denied: {
    label: 'Not Funded',
    color: '#8d302f',
    bg: '#fff5f4',
    border: '#efd3d0',
  },
  unrelated: {
    label: 'General',
    color: '#6f6b67',
    bg: '#f7f6f4',
    border: '#e7e3df',
  },
};

function formatRelativeDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CareInboxView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialThreadParam = searchParams.get('thread') || '';
  const initialFilterParam = searchParams.get('filter') || 'inbox';

  const [filter, setFilter] = useState<string>(initialFilterParam);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string>('Your profile');
  const [careEmail, setCareEmail] = useState<string | null>(null);
  const [inboxId, setInboxId] = useState<string | null>(null);
  const [agentMailConfigured, setAgentMailConfigured] = useState<boolean>(true);
  const [threads, setThreads] = useState<ThreadListItemData[]>([]);
  const [standaloneDrafts, setStandaloneDrafts] = useState<AgentDraftRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({
    inbox: 0,
    all: 0,
    needs_you: 0,
    waiting: 0,
    done: 0,
    drafts: 0,
    sent: 0,
    starred: 0,
    unread: 0,
  });

  const [selectedThreadId, setSelectedThreadId] = useState<string>(initialThreadParam);
  const [selectedDetail, setSelectedDetail] = useState<ThreadDetailPayload | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [loadingThread, setLoadingThread] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Draft / Consent state in reading pane
  const [draftRecipient, setDraftRecipient] = useState<string>('');
  const [draftSubject, setDraftSubject] = useState<string>('');
  const [draftBody, setDraftBody] = useState<string>('');
  const [inlineAnswer, setInlineAnswer] = useState<string>('');
  const [consentChecked, setConsentChecked] = useState<boolean>(true);
  const [sendingAction, setSendingAction] = useState<boolean>(false);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Record<string, boolean>>({});
  const [showReplyComposer, setShowReplyComposer] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');

  // Compose / Follow-up modal state
  const [composeOpen, setComposeOpen] = useState<boolean>(false);
  const [composeTo, setComposeTo] = useState<string>('grants@rememberbetty.com');
  const [composeSubject, setComposeSubject] = useState<string>('');
  const [composeBody, setComposeBody] = useState<string>('');
  const [composeConsent, setComposeConsent] = useState<boolean>(true);
  const [composeBusy, setComposeBusy] = useState<boolean>(false);
  const [provisioningInbox, setProvisioningInbox] = useState<boolean>(false);

  const activeThreadId =
    threads.some((t) => t.thread_id === selectedThreadId)
      ? selectedThreadId
      : threads[0]?.thread_id || '';

  const loadInbox = useCallback(
    async (opts?: { forceSync?: boolean; silent?: boolean }) => {
      try {
        const params = new URLSearchParams();
        params.set('filter', filter);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (opts?.forceSync) params.set('sync', '1');

        const res = await fetch(`/api/inbox?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load Care Inbox');

        setPatientId(data.patient_id || null);
        if (data.patient_name) setPatientName(data.patient_name);
        setCareEmail(data.care_email || null);
        setInboxId(data.inbox_id || null);
        setAgentMailConfigured(Boolean(data.agentmail_configured));
        setThreads(data.threads || []);
        setStandaloneDrafts(data.drafts || []);
        setApplications(data.applications || []);
        if (data.counts) setCounts(data.counts);

        if (data.sync_error && opts?.forceSync) {
          setBannerMessage({ type: 'error', text: data.sync_error });
        }
      } finally {
        setLoadingList(false);
        setSyncing(false);
      }
    },
    [filter, searchQuery]
  );

  useEffect(() => {
    loadInbox().catch(console.error);
  }, [loadInbox]);

  const loadThreadDetail = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(threadId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setSelectedDetail(null);
        return;
      }
      const data = (await res.json()) as ThreadDetailPayload;
      setSelectedDetail(data);

      if (data.draft) {
        setDraftRecipient(data.draft.to.join(', '));
        setDraftSubject(data.draft.subject);
        setDraftBody(data.draft.text);
      } else if (data.latest) {
        const defaultTo =
          data.latest.direction === 'inbound' ? data.latest.from : data.latest.to;
        setDraftRecipient(defaultTo);
        setDraftSubject(
          data.latest.subject.toLowerCase().startsWith('re:')
            ? data.latest.subject
            : `Re: ${data.latest.subject}`
        );
        setDraftBody('');
      }
      setInlineAnswer('');
      setConsentChecked(true);
      setShowReplyComposer(false);
      setReplyText('');

      if (data.messages && data.messages.length > 0) {
        const lastMsg = data.messages[data.messages.length - 1];
        setExpandedMsgIds({ [lastMsg.id]: true });
      }
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (activeThreadId) {
      loadThreadDetail(activeThreadId).catch(console.error);
    }
  }, [activeThreadId, loadThreadDetail]);

  async function handleProvisionInbox() {
    if (!patientId) {
      router.push('/onboarding');
      return;
    }
    setProvisioningInbox(true);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not provision AgentMail inbox.');
      setCareEmail(data.email || data.patient?.care_email || null);
      setInboxId(data.patient?.agentmail_inbox_id || data.email || null);
      setBannerMessage({
        type: 'success',
        text: `Confirmed AgentMail Care Inbox: ${data.email}`,
      });
      await loadInbox({ forceSync: true, silent: true });
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not provision AgentMail inbox.',
      });
    } finally {
      setProvisioningInbox(false);
    }
  }

  async function handleToggleStar(threadId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_star', thread_id: threadId }),
    });
    await loadInbox({ silent: true });
  }

  async function handleToggleUnread(threadId: string, currentlyUnread: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_unread', thread_id: threadId, unread: !currentlyUnread }),
    });
    await loadInbox({ silent: true });
  }

  async function handleConsentAndSendDraft() {
    if (!selectedDetail) return;
    if (!consentChecked) {
      setBannerMessage({
        type: 'error',
        text: 'Please check the consent box to authorize sending from your medical email.',
      });
      return;
    }

    setSendingAction(true);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(selectedDetail.thread_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'consent_send_draft',
          draft_id: selectedDetail.draft?.draft_id,
          to: draftRecipient,
          subject: draftSubject,
          text: draftBody,
          answer_value: inlineAnswer,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send email via AgentMail.');

      setBannerMessage({
        type: 'success',
        text: `Reply sent via AgentMail (${data.sent?.messageId || 'confirmed'}).`,
      });
      await loadInbox({ silent: true });
      await loadThreadDetail(selectedDetail.thread_id);
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not send reply.',
      });
    } finally {
      setSendingAction(false);
    }
  }

  async function handleSaveDraftEdits() {
    if (!selectedDetail) return;
    setSendingAction(true);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(selectedDetail.thread_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_or_update_draft',
          draft_id: selectedDetail.draft?.draft_id,
          to: draftRecipient,
          subject: draftSubject,
          text: draftBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update AgentMail draft.');
      setBannerMessage({
        type: 'success',
        text: `Updated AgentMail draft (${data.draft?.draft_id}).`,
      });
      await loadInbox({ silent: true });
      await loadThreadDetail(selectedDetail.thread_id);
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update draft.',
      });
    } finally {
      setSendingAction(false);
    }
  }

  async function handleDiscardDraft() {
    if (!selectedDetail?.draft) return;
    setSendingAction(true);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(selectedDetail.thread_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discard_draft',
          draft_id: selectedDetail.draft.draft_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not discard draft.');
      setBannerMessage({ type: 'success', text: 'AgentMail draft discarded.' });
      await loadInbox({ silent: true });
      await loadThreadDetail(selectedDetail.thread_id);
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not discard draft.',
      });
    } finally {
      setSendingAction(false);
    }
  }

  async function handleSendManualReply(asDraft: boolean) {
    if (!selectedDetail || !replyText.trim()) return;
    setSendingAction(true);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(selectedDetail.thread_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: asDraft ? 'create_or_update_draft' : 'reply',
          text: replyText.trim(),
          consent: !asDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');
      setBannerMessage({
        type: 'success',
        text: asDraft
          ? `Staged reply draft (${data.draft?.draft_id}) in AgentMail & added to Pending items.`
          : `Reply sent via AgentMail (${data.sent?.messageId}).`,
      });
      setReplyText('');
      setShowReplyComposer(false);
      await loadInbox({ silent: true });
      await loadThreadDetail(selectedDetail.thread_id);
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not complete action.',
      });
    } finally {
      setSendingAction(false);
    }
  }

  function openFollowUpModal(defaultApp?: ApplicationRecord | null) {
    const app = defaultApp || applications[0] || null;
    const programName = app?.resource.name || 'Remember Betty';
    setComposeTo('grants@rememberbetty.com');
    setComposeSubject(`Application Status Inquiry — ${patientName} (${programName})`);
    setComposeBody(
      `Hello ${programName} Grant Review Team,\n\nI am writing via my Care Concierge medical inbox to politely check on the status of my financial assistance application and confirm whether any additional documentation is needed from me.\n\nThank you very much for your time and support,\n${patientName}\n(Sent with patient consent via Apovo Care Concierge)`
    );
    setComposeConsent(true);
    setComposeOpen(true);
  }

  async function handleComposeSubmit(mode: 'draft' | 'send') {
    const app = applications[0];
    setComposeBusy(true);
    setBannerMessage(null);
    try {
      const endpoint = app
        ? `/api/applications/${encodeURIComponent(app.id)}/followup`
        : '/api/inbox';
      const payload = app
        ? {
            mode,
            to: composeTo.trim(),
            subject: composeSubject.trim(),
            text: composeBody.trim(),
          }
        : {
            action: mode === 'draft' ? 'create_followup_draft' : 'send_new',
            to: composeTo.trim(),
            subject: composeSubject.trim(),
            text: composeBody.trim(),
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not process follow-up email.');

      setComposeOpen(false);
      setBannerMessage({
        type: 'success',
        text:
          mode === 'draft'
            ? `Follow-up draft staged on AgentMail (${data.draft?.draft_id}) and added to Pending items for your consent.`
            : `Follow-up email sent via AgentMail (${data.email?.message_id}).`,
      });
      await loadInbox({ silent: true });
      if (data.email?.thread_id) {
        setSelectedThreadId(data.email.thread_id);
      } else if (data.draft?.thread_id) {
        setSelectedThreadId(data.draft.thread_id);
      }
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to process follow-up.',
      });
    } finally {
      setComposeBusy(false);
    }
  }

  async function handleReclassify(emailId: string, classification: EmailClassification) {
    if (!selectedDetail) return;
    await fetch(`/api/inbox/${encodeURIComponent(selectedDetail.thread_id)}/reclassify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId, classification }),
    });
    await loadInbox({ silent: true });
    await loadThreadDetail(selectedDetail.thread_id);
  }

  const filterTabs = useMemo(
    () => [
      { id: 'inbox', label: 'Inbox', count: counts.inbox },
      { id: 'needs_you', label: 'Action & Consent Needed', count: counts.needs_you },
      { id: 'waiting', label: 'Agent Follow-ups', count: counts.waiting },
      { id: 'drafts', label: 'Drafts', count: counts.drafts },
      { id: 'done', label: 'Approved & Resolved', count: counts.done },
      { id: 'sent', label: 'Sent', count: counts.sent },
      { id: 'starred', label: 'Starred', count: counts.starred },
    ],
    [counts]
  );

  return (
    <AppShell
      patientName={patientName}
      careEmail={careEmail || undefined}
      unreadEmailsCount={counts.unread}
      onRefreshData={() => void loadInbox({ forceSync: true })}
    >
      <div className="gmail-shell">
        {/* Top Banner for AgentMail Status or Action Feedback */}
        {bannerMessage && (
          <div className={`inbox-banner ${bannerMessage.type}`} role="status">
            <span>{bannerMessage.text}</span>
            <button type="button" onClick={() => setBannerMessage(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Provisioning Callout if Care Email is not yet created */}
        {!careEmail && !loadingList && (
          <div className="provision-card">
            <div className="provision-copy">
              <div className="provision-eyebrow">
                <Mail size={15} /> AgentMail Medical Identity
              </div>
              <h2>Activate your dedicated Care Email Inbox</h2>
              <p>
                Apovo uses your dedicated medical email on grant forms so our Inbox and Follow-up
                Agents can track application statuses, prepare replies, and notify you whenever your
                consent or additional information is required.
              </p>
            </div>
            <button
              type="button"
              className="minimal-btn minimal-btn-rose"
              disabled={provisioningInbox || !agentMailConfigured}
              onClick={() => void handleProvisionInbox()}
            >
              {provisioningInbox
                ? 'Provisioning via AgentMail…'
                : patientId
                ? 'Create Care Email Inbox'
                : 'Complete Onboarding First'}
            </button>
          </div>
        )}

        {/* Gmail-Inspired Top Search & Utility Toolbar */}
        <div className="gmail-toolbar">
          <div className="gmail-search-box">
            <Search size={17} className="search-icon" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search mail by grant program, subject, or status…"
              aria-label="Search care emails"
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="gmail-toolbar-actions">
            <button
              type="button"
              className="toolbar-btn"
              disabled={syncing || !inboxId}
              onClick={() => void loadInbox({ forceSync: true })}
              title="Sync threads and drafts from AgentMail v0 API"
            >
              <RefreshCw size={15} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Syncing…' : 'Sync AgentMail'}</span>
            </button>

            <button
              type="button"
              className="toolbar-btn primary-compose"
              disabled={!careEmail}
              onClick={() => openFollowUpModal()}
            >
              <Plus size={16} />
              <span>Follow Up / Compose</span>
            </button>
          </div>
        </div>

        {/* Gmail-Inspired Category Tabs */}
        <div className="gmail-tabs" role="tablist" aria-label="Email categories">
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`gmail-tab ${active ? 'active' : ''}`}
                onClick={() => {
                  setFilter(tab.id);
                  setSelectedThreadId('');
                }}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`tab-badge ${tab.id === 'needs_you' ? 'urgent' : ''}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Staged Standalone AgentMail Drafts Banner (if any draft doesn't have an inbound thread yet) */}
        {standaloneDrafts.filter((d) => !threads.some((t) => t.thread_id === d.thread_id)).length >
          0 && (
          <div className="staged-drafts-strip">
            <div className="strip-title">
              <FileEdit size={15} />
              <span>Staged AgentMail Follow-up Drafts Awaiting Your Consent</span>
            </div>
            <div className="strip-items">
              {standaloneDrafts
                .filter((d) => !threads.some((t) => t.thread_id === d.thread_id))
                .map((d) => (
                  <div key={d.draft_id} className="strip-draft-card">
                    <div>
                      <strong>{d.program_name}</strong> · <span>{d.subject}</span>
                      <div className="strip-meta">
                        To: {d.to.join(', ')} · AgentMail ID: <code>{d.draft_id}</code>
                      </div>
                    </div>
                    <div className="strip-actions">
                      <Link href="/tasks" className="strip-consent-link">
                        Review & Consent in Pending Items →
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Main Split-Pane Workspace: Left Thread List + Right Reading & Consent Pane */}
        <div className="gmail-split-pane" data-mobile-detail={Boolean(selectedThreadId)}>
          {/* Left Column: Gmail-Inspired Thread List */}
          <div className="gmail-thread-list" role="region" aria-label="Email thread list">
            {loadingList ? (
              <div className="empty-list-state">Loading your Care Inbox…</div>
            ) : threads.length === 0 ? (
              <div className="empty-list-state">
                <Mail size={28} style={{ color: 'var(--ink-muted)', marginBottom: '8px' }} />
                <h3>No emails in this view yet</h3>
                <p>
                  {careEmail
                    ? `Your AgentMail address (${careEmail}) is active. When grant programs reply or when Apovo stages a status follow-up, threads appear here automatically.`
                    : 'Activate your Care Email above so Apovo agents can track your grant forms and follow up on your behalf.'}
                </p>
                {careEmail && (
                  <div className="empty-list-actions">
                    <button
                      type="button"
                      className="minimal-btn minimal-btn-secondary"
                      onClick={() => openFollowUpModal()}
                    >
                      Stage a Grant Status Follow-up
                    </button>
                  </div>
                )}
              </div>
            ) : (
              threads.map((thread) => {
                const isSelected = thread.thread_id === activeThreadId;
                const isUnread = thread.unreadCount > 0;
                const classMeta =
                  CLASSIFICATION_META[thread.latest.classification] ||
                  CLASSIFICATION_META.unrelated;

                return (
                  <div
                    key={thread.thread_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedThreadId(thread.thread_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedThreadId(thread.thread_id);
                      }
                    }}
                    className={`gmail-row ${isSelected ? 'selected' : ''} ${
                      isUnread ? 'unread' : 'read'
                    }`}
                  >
                    <div className="row-left-controls">
                      <button
                        type="button"
                        className={`star-btn ${thread.starred ? 'starred' : ''}`}
                        onClick={(e) => void handleToggleStar(thread.thread_id, e)}
                        aria-label={thread.starred ? 'Unstar thread' : 'Star thread'}
                      >
                        <Star size={15} fill={thread.starred ? '#d97706' : 'none'} />
                      </button>
                      {isUnread && <span className="unread-dot" aria-label="Unread" />}
                    </div>

                    <div className="row-content">
                      <div className="row-top-line">
                        <div className="row-sender">
                          <span className="sender-name">{thread.program_name}</span>
                          {thread.messageCount > 1 && (
                            <span className="msg-count">{thread.messageCount}</span>
                          )}
                          {thread.latest.direction === 'outbound' && (
                            <span className="outbound-tag" title="Sent from your Care Email">
                              <ArrowUpRight size={12} /> {thread.hasInbound ? 'Replied' : 'Sent'}
                            </span>
                          )}
                        </div>

                        <div className="row-right-meta">
                          <span className="row-time">
                            {formatRelativeDate(thread.latest.created_at)}
                          </span>
                          <div className="row-hover-actions">
                            <button
                              type="button"
                              onClick={(e) =>
                                void handleToggleUnread(thread.thread_id, isUnread, e)
                              }
                              title={isUnread ? 'Mark as read' : 'Mark as unread'}
                            >
                              <MailOpen size={14} />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="row-subject-line">
                        <span className="subject-text">{thread.subject}</span>
                      </div>

                      <div className="row-snippet-line">
                        <span
                          className="class-chip"
                          style={{
                            color: classMeta.color,
                            backgroundColor: classMeta.bg,
                            borderColor: classMeta.border,
                          }}
                        >
                          {classMeta.label}
                        </span>

                        {thread.pendingDraft && (
                          <span className="consent-pill">
                            <FileEdit size={11} /> Draft Awaiting Consent
                          </span>
                        )}

                        <span className="snippet-text">
                          {thread.latest.summary ||
                            thread.latest.extracted_text ||
                            thread.latest.body_text}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Split Reading Pane & Agent Consent Controls */}
          <div className="gmail-reading-pane" role="region" aria-label="Email conversation detail">
            <button type="button" className="mobile-inbox-back" onClick={() => setSelectedThreadId('')}>
              <ArrowLeft size={17} /> Back to inbox
            </button>
            {loadingThread ? (
              <div className="empty-reading-pane">Loading conversation…</div>
            ) : !selectedDetail ? (
              <div className="empty-reading-pane">
                <Sparkles size={26} style={{ color: 'var(--rose)', marginBottom: '8px' }} />
                <h3>Select an email thread to inspect</h3>
                <p>
                  Apovo&apos;s Inbox Agent summarizes every program email, highlights deadlines, and
                  stages replies in AgentMail so you can approve them with one click.
                </p>
              </div>
            ) : (
              <div className="thread-detail-container">
                {/* Thread Header */}
                <div className="thread-header">
                  <div>
                    <div className="thread-program-badge">{selectedDetail.program_name}</div>
                    <h2 className="thread-subject">{selectedDetail.subject}</h2>
                  </div>

                  {selectedDetail.latest && (
                    <div className="reclassify-control">
                      <label htmlFor="reclassify-select">Agent Label:</label>
                      <select
                        id="reclassify-select"
                        value={selectedDetail.latest.classification}
                        onChange={(e) =>
                          void handleReclassify(
                            selectedDetail.latest!.id,
                            e.target.value as EmailClassification
                          )
                        }
                      >
                        <option value="confirmation">Confirmed</option>
                        <option value="needs_info">Action / Info Needed</option>
                        <option value="pending">Awaiting Reply</option>
                        <option value="approved">Approved</option>
                        <option value="benefit_delivered">Benefit Delivered</option>
                        <option value="denied">Not Funded</option>
                        <option value="unrelated">General</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Apovo AI Inbox Agent Summary Card */}
                {selectedDetail.latest && (
                  <div className="ai-summary-card">
                    <div className="ai-summary-header">
                      <div className="ai-badge">
                        <Sparkles size={14} />
                        <span>Apovo Inbox Agent Summary</span>
                      </div>
                      {selectedDetail.latest.deadline && (
                        <span className="deadline-badge">
                          <Clock size={13} /> Requested by {selectedDetail.latest.deadline}
                        </span>
                      )}
                    </div>
                    <p className="ai-summary-text">{selectedDetail.latest.summary}</p>
                    {selectedDetail.latest.actions_taken &&
                      selectedDetail.latest.actions_taken.length > 0 && (
                        <div className="ai-actions-list">
                          {selectedDetail.latest.actions_taken.map((act, idx) => (
                            <span key={idx} className="ai-action-item">
                              <CheckCircle2 size={12} /> {act}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                )}

                {/* Human-in-the-Loop AgentMail Draft & Consent Card */}
                {(selectedDetail.draft ||
                  selectedDetail.latest?.classification === 'needs_info') && (
                  <div className="consent-draft-card">
                    <div className="consent-card-header">
                      <div>
                        <div className="consent-eyebrow">
                          <ShieldCheck size={15} /> Consent Required Before Sending
                        </div>
                        <h3>
                          {selectedDetail.draft
                            ? 'Review Staged AgentMail Reply Draft'
                            : 'Reply to Program Request with Your Consent'}
                        </h3>
                      </div>
                      {selectedDetail.draft && (
                        <span className="draft-id-pill">
                          AgentMail Draft: <code>{selectedDetail.draft.draft_id}</code>
                        </span>
                      )}
                    </div>

                    {selectedDetail.task && selectedDetail.task.status === 'open' && (
                      <div className="linked-question-box">
                        <div className="question-label">
                          <AlertCircle size={14} /> {selectedDetail.task.title}
                        </div>
                        <p className="question-why">{selectedDetail.task.why}</p>
                        <input
                          type="text"
                          value={inlineAnswer}
                          onChange={(e) => setInlineAnswer(e.target.value)}
                          placeholder="Type the requested detail here to insert into the reply…"
                          className="inline-answer-input"
                        />
                      </div>
                    )}

                    <div className="draft-fields">
                      <div className="draft-meta-row">
                        <span>From:</span>
                        <code>{careEmail || 'Your Care Inbox'}</code>
                      </div>
                      <div className="draft-meta-row">
                        <label htmlFor="draft-to">To:</label>
                        <input
                          id="draft-to"
                          type="email"
                          value={draftRecipient}
                          onChange={(e) => setDraftRecipient(e.target.value)}
                        />
                      </div>
                      <div className="draft-meta-row">
                        <label htmlFor="draft-subject">Subject:</label>
                        <input
                          id="draft-subject"
                          type="text"
                          value={draftSubject}
                          onChange={(e) => setDraftSubject(e.target.value)}
                        />
                      </div>
                      <textarea
                        rows={5}
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        placeholder="Write or edit the message Apovo will send on your behalf…"
                      />
                    </div>

                    <label className="consent-checkbox-row">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                      />
                      <span>
                        I consent to Apovo sending this email from my dedicated medical address (
                        <code>{careEmail}</code>) via AgentMail.
                      </span>
                    </label>

                    <div className="consent-actions">
                      <button
                        type="button"
                        className="minimal-btn minimal-btn-rose"
                        disabled={sendingAction || !consentChecked}
                        onClick={() => void handleConsentAndSendDraft()}
                      >
                        <Send size={15} />
                        <span>
                          {sendingAction ? 'Sending via AgentMail…' : 'Consent & Send Reply'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="minimal-btn minimal-btn-secondary"
                        disabled={sendingAction}
                        onClick={() => void handleSaveDraftEdits()}
                      >
                        <FileEdit size={15} />
                        <span>Save Draft in AgentMail</span>
                      </button>

                      {selectedDetail.draft && (
                        <button
                          type="button"
                          className="minimal-btn minimal-btn-ghost"
                          disabled={sendingAction}
                          onClick={() => void handleDiscardDraft()}
                        >
                          <Trash2 size={15} />
                          <span>Discard</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Follow-up Agent Ladder Bar */}
                {selectedDetail.followUpConfig && (
                  <div className="followup-ladder-card">
                    <div className="ladder-top">
                      <div>
                        <strong>Automated Follow-up Schedule</strong>
                        <span className="ladder-sub">
                          Next: {selectedDetail.followUpConfig.next_followup_label}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ladder-btn"
                        onClick={() => openFollowUpModal(selectedDetail.application)}
                      >
                        Stage / Send Status Follow-up
                      </button>
                    </div>
                    <div className="ladder-steps">
                      {selectedDetail.followUpConfig.ladder.map((step) => (
                        <div key={step.step} className={`ladder-step ${step.status}`}>
                          <span className="step-dot" />
                          <span>
                            Day {step.day}: {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chronological Message Stack */}
                <div className="message-stack">
                  {selectedDetail.messages.map((msg, idx) => {
                    const isLast = idx === selectedDetail.messages.length - 1;
                    const expanded = expandedMsgIds[msg.id] ?? isLast;
                    return (
                      <article key={msg.id} className={`message-card ${msg.direction}`}>
                        <div
                          className="message-card-header"
                          onClick={() =>
                            setExpandedMsgIds((prev) => ({ ...prev, [msg.id]: !expanded }))
                          }
                        >
                          <div className="msg-sender-info">
                            <strong>
                              {msg.direction === 'outbound' ? 'You (via Apovo AgentMail)' : msg.from}
                            </strong>
                            <span className="msg-to">to {msg.to}</span>
                            {msg.message_id && (
                              <code className="msg-id-tag" title="AgentMail Message ID">
                                {msg.message_id}
                              </code>
                            )}
                          </div>
                          <div className="msg-header-right">
                            <span>{formatRelativeDate(msg.created_at)}</span>
                            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </div>
                        </div>

                        {expanded && (
                          <div className="message-card-body">
                            {msg.extracted_text || msg.body_text ? (
                              <div className="msg-plain-text">
                                {msg.extracted_text || msg.body_text}
                              </div>
                            ) : (
                              <div
                                className="msg-html-text"
                                dangerouslySetInnerHTML={{ __html: msg.body_html }}
                              />
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                {/* Bottom Reply Box */}
                <div className="thread-reply-footer">
                  {!showReplyComposer ? (
                    <button
                      type="button"
                      className="minimal-btn minimal-btn-secondary"
                      onClick={() => setShowReplyComposer(true)}
                    >
                      <Send size={14} /> Reply or Stage Draft on Thread
                    </button>
                  ) : (
                    <div className="reply-composer-box">
                      <textarea
                        rows={4}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write a reply to continue this thread via AgentMail…"
                      />
                      <div className="reply-composer-actions">
                        <button
                          type="button"
                          className="minimal-btn minimal-btn-rose"
                          disabled={sendingAction || !replyText.trim()}
                          onClick={() => void handleSendManualReply(false)}
                        >
                          Consent & Send Reply Now
                        </button>
                        <button
                          type="button"
                          className="minimal-btn minimal-btn-secondary"
                          disabled={sendingAction || !replyText.trim()}
                          onClick={() => void handleSendManualReply(true)}
                        >
                          Stage as AgentMail Draft (Requires Consent)
                        </button>
                        <button
                          type="button"
                          className="minimal-btn minimal-btn-ghost"
                          onClick={() => setShowReplyComposer(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Follow-up / Compose Modal */}
        {composeOpen && (
          <div className="compose-modal-backdrop" role="dialog" aria-modal="true">
            <div className="compose-modal">
              <div className="compose-modal-header">
                <div>
                  <strong>Follow-up & Status Inquiry (AgentMail v0)</strong>
                  <span>From: {careEmail}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="compose-modal-body">
                <label className="compose-field">
                  <span>Recipient (Grant Program Email)</span>
                  <input
                    type="email"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder="grants@program.org"
                  />
                </label>

                <label className="compose-field">
                  <span>Subject</span>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                  />
                </label>

                <label className="compose-field">
                  <span>Message Body</span>
                  <textarea
                    rows={6}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                  />
                </label>

                <label className="consent-checkbox-row">
                  <input
                    type="checkbox"
                    checked={composeConsent}
                    onChange={(e) => setComposeConsent(e.target.checked)}
                  />
                  <span>
                    I authorize Apovo to stage or send this message from my medical email (
                    <code>{careEmail}</code>).
                  </span>
                </label>
              </div>

              <div className="compose-modal-footer">
                <button
                  type="button"
                  className="minimal-btn minimal-btn-secondary"
                  disabled={composeBusy}
                  onClick={() => void handleComposeSubmit('draft')}
                >
                  <FileEdit size={15} />
                  <span>Stage as Draft (Approve in Pending Items)</span>
                </button>
                <button
                  type="button"
                  className="minimal-btn minimal-btn-rose"
                  disabled={composeBusy || !composeConsent}
                  onClick={() => void handleComposeSubmit('send')}
                >
                  <Send size={15} />
                  <span>{composeBusy ? 'Working…' : 'Consent & Send Now'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .gmail-shell {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }

        .inbox-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.86rem;
          font-weight: 500;
        }
        .inbox-banner.success {
          background: #eef8f2;
          border: 1px solid #bfe3cd;
          color: #177245;
        }
        .inbox-banner.error {
          background: #fff5f4;
          border: 1px solid #efd3d0;
          color: #8d302f;
        }
        .inbox-banner button {
          background: none;
          border: none;
          cursor: pointer;
          color: inherit;
        }

        .provision-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 22px 24px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--surface-soft);
        }
        .provision-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--rose);
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        .provision-copy h2 {
          font-size: 1.2rem;
          margin-bottom: 6px;
        }
        .provision-copy p {
          font-size: 0.88rem;
          max-width: 680px;
          margin: 0;
        }

        .gmail-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .gmail-search-box {
          flex: 1;
          min-width: 260px;
          max-width: 580px;
          position: relative;
          display: flex;
          align-items: center;
          background: var(--surface-soft);
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 0 14px;
          height: 42px;
        }
        .gmail-search-box:focus-within {
          background: var(--paper);
          border-color: var(--rose);
        }
        .gmail-search-box input {
          width: 100%;
          border: none;
          background: transparent;
          padding: 8px 10px;
          font: inherit;
          font-size: 0.88rem;
          color: var(--ink);
          outline: none;
        }
        .clear-search {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ink-muted);
          display: flex;
        }

        .gmail-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 40px;
          padding: 0 15px;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--paper);
          color: var(--ink);
          font: inherit;
          font-size: 0.84rem;
          font-weight: 500;
          cursor: pointer;
        }
        .toolbar-btn:hover:not(:disabled) {
          background: var(--surface-soft);
        }
        .toolbar-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .toolbar-btn.primary-compose {
          background: var(--rose);
          border-color: var(--rose);
          color: var(--paper);
        }

        .gmail-tabs {
          display: flex;
          align-items: center;
          gap: 4px;
          border-bottom: 1px solid var(--line);
          overflow-x: auto;
        }
        .gmail-tab {
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
        .gmail-tab.active {
          color: var(--rose);
          border-bottom-color: var(--rose);
          font-weight: 600;
        }
        .tab-badge {
          font-size: 0.72rem;
          padding: 1px 7px;
          border-radius: 999px;
          background: var(--surface-soft);
          color: var(--ink-muted);
        }
        .tab-badge.urgent {
          background: rgba(180, 82, 109, 0.14);
          color: var(--rose);
          font-weight: 600;
        }

        .staged-drafts-strip {
          padding: 14px 18px;
          border: 1px solid rgba(180, 82, 109, 0.35);
          border-radius: 10px;
          background: rgba(180, 82, 109, 0.04);
          display: grid;
          gap: 10px;
        }
        .strip-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--rose);
        }
        .strip-items {
          display: grid;
          gap: 8px;
        }
        .strip-draft-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 8px;
          font-size: 0.84rem;
        }
        .strip-meta {
          font-size: 0.76rem;
          color: var(--ink-muted);
          margin-top: 2px;
        }
        .strip-consent-link {
          color: var(--rose);
          font-weight: 600;
          font-size: 0.8rem;
          text-decoration: none;
          white-space: nowrap;
        }

        .gmail-split-pane {
          display: grid;
          grid-template-columns: minmax(340px, 42%) minmax(0, 58%);
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--paper);
          min-height: 640px;
          overflow: hidden;
        }

        .gmail-thread-list {
          border-right: 1px solid var(--line);
          overflow-y: auto;
          max-height: 760px;
        }

        .empty-list-state,
        .empty-reading-pane {
          padding: 56px 28px;
          text-align: center;
          color: var(--ink-muted);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
        }
        .empty-list-state h3,
        .empty-reading-pane h3 {
          font-size: 1.05rem;
          margin-bottom: 6px;
          color: var(--ink);
        }
        .empty-list-state p,
        .empty-reading-pane p {
          font-size: 0.85rem;
          max-width: 380px;
          margin-bottom: 16px;
        }

        .gmail-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
          cursor: pointer;
          transition: background-color 120ms ease;
        }
        .gmail-row.read {
          background: var(--surface-soft);
        }
        .gmail-row.unread {
          background: var(--paper);
        }
        .gmail-row:hover {
          background: #f1efec;
        }
        .gmail-row.selected {
          background: rgba(180, 82, 109, 0.07);
          border-left: 3px solid var(--rose);
        }

        .row-left-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          padding-top: 2px;
        }
        .star-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ink-muted);
          padding: 2px;
          display: flex;
        }
        .star-btn.starred {
          color: #d97706;
        }
        .unread-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--rose);
        }

        .row-content {
          flex: 1;
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .row-top-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .row-sender {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .sender-name {
          font-size: 0.88rem;
          color: var(--ink);
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gmail-row.unread .sender-name,
        .gmail-row.unread .subject-text {
          font-weight: 700;
        }
        .msg-count {
          font-size: 0.72rem;
          color: var(--ink-muted);
          background: var(--line);
          padding: 0 5px;
          border-radius: 4px;
        }
        .outbound-tag {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          font-size: 0.7rem;
          color: var(--ink-muted);
        }
        .row-right-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .row-time {
          font-size: 0.75rem;
          color: var(--ink-muted);
        }
        .row-hover-actions {
          display: none;
        }
        .gmail-row:hover .row-hover-actions {
          display: inline-flex;
        }
        .row-hover-actions button {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ink-muted);
          padding: 2px;
        }

        .row-subject-line {
          font-size: 0.85rem;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .row-snippet-line {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .class-chip {
          font-size: 0.68rem;
          font-weight: 600;
          padding: 1px 7px;
          border-radius: 999px;
          border: 1px solid transparent;
          flex-shrink: 0;
        }
        .consent-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.68rem;
          font-weight: 600;
          padding: 1px 7px;
          border-radius: 999px;
          background: rgba(180, 82, 109, 0.12);
          color: var(--rose);
          flex-shrink: 0;
        }
        .snippet-text {
          font-size: 0.78rem;
          color: var(--ink-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .gmail-reading-pane {
          overflow-y: auto;
          max-height: 760px;
          padding: 24px 28px;
        }
        .mobile-inbox-back { display: none; }

        .thread-detail-container {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .thread-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--line);
        }
        .thread-program-badge {
          font-size: 0.74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--rose);
          margin-bottom: 4px;
        }
        .thread-subject {
          font-size: 1.25rem;
          margin: 0;
        }
        .reclassify-control {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.76rem;
          color: var(--ink-muted);
          flex-shrink: 0;
        }
        .reclassify-control select {
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--line);
          font: inherit;
          font-size: 0.76rem;
          background: var(--paper);
        }

        .ai-summary-card {
          padding: 16px 18px;
          border-radius: 10px;
          background: var(--surface-soft);
          border: 1px solid var(--line);
          display: grid;
          gap: 8px;
        }
        .ai-summary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ai-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--rose);
        }
        .deadline-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.74rem;
          font-weight: 600;
          color: #9a5a12;
          background: #fff8eb;
          border: 1px solid #f0d9b5;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .ai-summary-text {
          font-size: 0.88rem;
          color: var(--ink);
          margin: 0;
        }
        .ai-actions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .ai-action-item {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.75rem;
          color: var(--ink-muted);
        }

        .consent-draft-card {
          padding: 18px 20px;
          border-radius: 10px;
          border: 1.5px solid var(--rose);
          background: #fffafb;
          display: grid;
          gap: 14px;
        }
        .consent-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .consent-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--rose);
          margin-bottom: 4px;
        }
        .consent-card-header h3 {
          font-size: 1rem;
          margin: 0;
        }
        .draft-id-pill {
          font-size: 0.73rem;
          color: var(--ink-muted);
          background: var(--paper);
          border: 1px solid var(--line);
          padding: 3px 8px;
          border-radius: 6px;
        }

        .linked-question-box {
          padding: 12px 14px;
          background: var(--paper);
          border: 1px solid #f0d9b5;
          border-radius: 8px;
          display: grid;
          gap: 6px;
        }
        .question-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.84rem;
          font-weight: 600;
          color: #9a5a12;
        }
        .question-why {
          font-size: 0.78rem;
          margin: 0;
        }
        .inline-answer-input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font: inherit;
          font-size: 0.84rem;
        }

        .draft-fields {
          display: grid;
          gap: 8px;
        }
        .draft-meta-row {
          display: grid;
          grid-template-columns: 65px 1fr;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: var(--ink-muted);
        }
        .draft-meta-row input,
        .draft-fields textarea {
          width: 100%;
          padding: 7px 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font: inherit;
          font-size: 0.84rem;
          background: var(--paper);
          color: var(--ink);
        }

        .consent-checkbox-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.8rem;
          color: var(--ink);
          cursor: pointer;
        }
        .consent-checkbox-row input {
          margin-top: 3px;
        }

        .consent-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .followup-ladder-card {
          padding: 14px 16px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--paper);
          display: grid;
          gap: 10px;
        }
        .ladder-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 0.84rem;
        }
        .ladder-sub {
          display: block;
          font-size: 0.76rem;
          color: var(--ink-muted);
        }
        .ladder-btn {
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid var(--line);
          background: var(--surface-soft);
          font: inherit;
          font-size: 0.78rem;
          font-weight: 500;
          cursor: pointer;
        }
        .ladder-steps {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 0.76rem;
          color: var(--ink-muted);
        }
        .ladder-step {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .step-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--line);
        }
        .ladder-step.completed .step-dot {
          background: #177245;
        }
        .ladder-step.active .step-dot {
          background: var(--rose);
        }

        .message-stack {
          display: grid;
          gap: 10px;
        }
        .message-card {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--paper);
          overflow: hidden;
        }
        .message-card.outbound {
          background: #fcfbfa;
        }
        .message-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          font-size: 0.82rem;
        }
        .msg-sender-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .msg-to {
          color: var(--ink-muted);
          font-size: 0.76rem;
        }
        .msg-id-tag {
          font-size: 0.7rem;
          background: var(--surface-soft);
          padding: 1px 6px;
          border-radius: 4px;
          color: var(--ink-muted);
        }
        .msg-header-right {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--ink-muted);
          font-size: 0.75rem;
        }
        .message-card-body {
          padding: 14px 16px 18px;
          border-top: 1px solid var(--line);
          font-size: 0.88rem;
          line-height: 1.6;
        }
        .msg-plain-text {
          white-space: pre-wrap;
          color: var(--ink);
        }

        .thread-reply-footer {
          padding-top: 8px;
        }
        .reply-composer-box {
          display: grid;
          gap: 10px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface-soft);
        }
        .reply-composer-box textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font: inherit;
          font-size: 0.86rem;
          background: var(--paper);
        }
        .reply-composer-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .compose-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.35);
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .compose-modal {
          width: 100%;
          max-width: 560px;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
          display: grid;
        }
        .compose-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--line);
          background: var(--surface-soft);
        }
        .compose-modal-header strong {
          display: block;
          font-size: 0.94rem;
        }
        .compose-modal-header span {
          font-size: 0.76rem;
          color: var(--ink-muted);
          font-family: monospace;
        }
        .compose-modal-header button {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ink-muted);
        }
        .compose-modal-body {
          padding: 20px;
          display: grid;
          gap: 14px;
        }
        .compose-field {
          display: grid;
          gap: 5px;
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--ink-muted);
        }
        .compose-field input,
        .compose-field textarea {
          width: 100%;
          padding: 9px 12px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font: inherit;
          font-size: 0.86rem;
          color: var(--ink);
        }
        .compose-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 20px;
          border-top: 1px solid var(--line);
          background: var(--surface-soft);
          flex-wrap: wrap;
        }

        @media (max-width: 960px) {
          .gmail-split-pane {
            grid-template-columns: 1fr;
          }
          .gmail-thread-list {
            max-height: 360px;
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
        }
        @media (max-width: 700px) {
          .gmail-shell { gap: 12px; }
          .provision-card { padding: 18px; align-items: stretch; flex-direction: column; }
          .gmail-toolbar { display: grid; gap: 10px; }
          .gmail-search-box { min-width: 0; max-width: none; width: 100%; height: 46px; }
          .gmail-toolbar-actions { display: grid; grid-template-columns: 44px minmax(0, 1fr); }
          .toolbar-btn { min-height: 44px; height: 44px; justify-content: center; }
          .toolbar-btn:first-child { width: 44px; padding: 0; }
          .toolbar-btn:first-child span { display: none; }
          .gmail-tabs { margin-right: -20px; padding-right: 20px; scrollbar-width: none; }
          .gmail-tabs::-webkit-scrollbar { display: none; }
          .gmail-tab { min-height: 44px; padding-inline: 12px; }
          .staged-drafts-strip { padding: 12px; }
          .strip-draft-card { align-items: stretch; flex-direction: column; }
          .strip-consent-link { min-height: 44px; display: flex; align-items: center; white-space: normal; }
          .gmail-split-pane { min-height: 0; display: block; border-radius: 10px; overflow: visible; }
          .gmail-split-pane[data-mobile-detail='false'] .gmail-reading-pane { display: none; }
          .gmail-split-pane[data-mobile-detail='true'] .gmail-thread-list { display: none; }
          .gmail-thread-list { max-height: none; border: 0; overflow: visible; }
          .gmail-reading-pane { max-height: none; padding: 14px; overflow: visible; }
          .mobile-inbox-back { min-height: 44px; margin: -4px 0 10px; padding: 0 8px; border: 0; display: inline-flex; align-items: center; gap: 7px; background: transparent; color: var(--rose-text); font: inherit; font-size: .84rem; font-weight: 600; cursor: pointer; }
          .gmail-row { min-height: 88px; padding: 14px 12px; }
          .star-btn, .row-hover-actions button { min-width: 36px; min-height: 36px; align-items: center; justify-content: center; }
          .row-hover-actions, .gmail-row:hover .row-hover-actions { display: inline-flex; }
          .thread-header { align-items: stretch; flex-direction: column; }
          .thread-subject { font-size: 1.1rem; text-wrap: balance; }
          .reclassify-control { justify-content: space-between; }
          .reclassify-control select { min-height: 44px; }
          .ai-summary-header, .ladder-top { align-items: flex-start; flex-direction: column; }
          .consent-draft-card { padding: 14px; }
          .draft-meta-row { grid-template-columns: 1fr; }
          .draft-meta-row code { overflow-wrap: anywhere; }
          .consent-checkbox-row { gap: 12px; font-size: .86rem; }
          .consent-checkbox-row input { width: 20px; height: 20px; }
          .consent-actions, .reply-composer-actions { display: grid; grid-template-columns: 1fr; }
          .consent-actions button, .reply-composer-actions button, .thread-reply-footer > button { width: 100%; min-height: 46px; justify-content: center; }
          .message-card-header { min-height: 56px; }
          .msg-id-tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
          .compose-modal-backdrop { padding: 0; align-items: stretch; }
          .compose-modal { max-width: none; min-height: 100dvh; border: 0; border-radius: 0; grid-template-rows: auto minmax(0, 1fr) auto; }
          .compose-modal-header { padding: calc(12px + env(safe-area-inset-top)) 16px 12px; }
          .compose-modal-header button { min-width: 44px; min-height: 44px; }
          .compose-modal-body { padding: 16px; overflow-y: auto; }
          .compose-modal-footer { padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: 1fr; }
          .compose-modal-footer button { width: 100%; min-height: 46px; justify-content: center; }
        }
      `}</style>
    </AppShell>
  );
}
