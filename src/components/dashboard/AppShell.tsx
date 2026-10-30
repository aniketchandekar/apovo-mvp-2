'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FolderHeart,
  MessageCircle,
  Mail,
  ClipboardCheck,
  Bell,
  Copy,
  Check,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  X,
  FlaskConical,
} from 'lucide-react';
import { useTestMode } from '@/components/application-test/TestModeContext';
import { useDemoSession } from '@/components/demo/DemoSessionProvider';

interface AppShellProps {
  children: React.ReactNode;
  patientName?: string;
  patientInitials?: string;
  careEmail?: string;
  openTasksCount?: number;
  unreadEmailsCount?: number;
  isRealtimeConnected?: boolean;
  onRefreshData?: () => void;
  onOpenTasks?: () => void;
}

export function AppShell({
  children,
  patientName = 'Your profile',
  careEmail: initialCareEmail,
  openTasksCount: initialPendingCount,
  unreadEmailsCount: initialUnreadCount,
  onRefreshData,
}: AppShellProps) {
  const pathname = usePathname();
  const testMode = useTestMode();
  const demo = useDemoSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const handleClearData = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear all data? This will reset all grant applications, tasks, messages, and profile data to a clean state.'
    );
    if (!confirmed) return;

    setClearingData(true);
    try {
      const res = await fetch('/api/data/clear', { method: 'POST' });
      if (res.ok) {
        if (onRefreshData) {
          try {
            await onRefreshData();
          } catch {
            // ignore
          }
        }
        window.location.reload();
      } else {
        alert('Could not clear data. Please try again.');
      }
    } catch (err) {
      console.error('Error clearing data:', err);
      alert('Network issue while clearing data.');
    } finally {
      setClearingData(false);
    }
  };

  const [fetchedCareEmail, setFetchedCareEmail] = useState('');
  const [fetchedPatientName, setFetchedPatientName] = useState('');
  const [fetchedPendingCount, setFetchedPendingCount] = useState<number>(0);
  const [fetchedUnreadCount, setFetchedUnreadCount] = useState<number>(0);
  const [fetchedStartedCount, setFetchedStartedCount] = useState<number>(0);

  const careEmail = initialCareEmail || fetchedCareEmail;
  const patientDisplayName =
    patientName && patientName !== 'Your profile'
      ? patientName
      : fetchedPatientName || patientName;
  const pendingCount = initialPendingCount ?? fetchedPendingCount;
  const unreadCount = initialUnreadCount ?? fetchedUnreadCount;

  // Sync / fetch care email, unread emails, and pending items count
  useEffect(() => {
    let isMounted = true;
    async function loadNavData() {
      try {
        const res = await fetch('/api/dashboard', { cache: 'no-store' });
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.patient?.care_email) {
            setFetchedCareEmail(data.patient.care_email);
          }
          if (data.patient?.first_name) {
            setFetchedPatientName(
              `${data.patient.first_name} ${data.patient.last_name || ''}`.trim()
            );
          }
          if (typeof data.pendingItemsCount === 'number') {
            setFetchedPendingCount(data.pendingItemsCount);
          } else if (typeof data.openTasksCount === 'number') {
            setFetchedPendingCount(data.openTasksCount);
          }
          if (typeof data.unreadEmailsCount === 'number') {
            setFetchedUnreadCount(data.unreadEmailsCount);
          }
          if (Array.isArray(data.startedGrants)) {
            setFetchedStartedCount(data.startedGrants.length);
          }
        }
      } catch (e) {
        console.error('Error fetching shell metadata:', e);
      }
    }
    loadNavData();
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const sidebar = sidebarRef.current;
    const opener = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = () => Array.from(
      sidebar?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    );
    focusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [sidebarOpen]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(careEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  const navItems = [
    {
      label: 'Home',
      mobileLabel: 'Home',
      href: '/dashboard',
      icon: Home,
      active: pathname === '/dashboard' || pathname === '/',
      badge: fetchedStartedCount,
    },
    {
      label: 'My resource',
      mobileLabel: 'Resources',
      href: '/resources',
      icon: FolderHeart,
      active: pathname === '/resources' || pathname.startsWith('/applications'),
      badge: 0,
    },
    {
      label: 'Talk with Apovo',
      mobileLabel: 'Talk',
      href: '/talk',
      icon: MessageCircle,
      active: pathname === '/talk' || pathname.startsWith('/talk/'),
      badge: 0,
    },
    {
      label: 'Inbox',
      mobileLabel: 'Inbox',
      href: '/inbox',
      icon: Mail,
      active: pathname === '/inbox' || pathname.startsWith('/inbox/'),
      badge: unreadCount,
    },
    {
      label: 'Pending items',
      mobileLabel: 'Tasks',
      href: '/tasks',
      icon: ClipboardCheck,
      active: pathname === '/tasks' || pathname.startsWith('/tasks/'),
      badge: pendingCount,
    },
  ];

  function getPageTitle() {
    if (pathname === '/dashboard' || pathname === '/') return 'Home';
    if (pathname === '/resources') return 'My resource';
    if (pathname === '/talk' || pathname.startsWith('/talk/')) return 'Talk with Apovo';
    if (pathname === '/inbox' || pathname.startsWith('/inbox/')) return 'Inbox';
    if (pathname === '/tasks' || pathname.startsWith('/tasks/')) return 'Pending items';
    return '';
  }

  return (
    <div
      className="app-shell"
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: 'var(--paper)',
        color: 'var(--ink)',
      }}
    >
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 40,
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        id="app-navigation-drawer"
        className={`app-sidebar ${sidebarOpen ? 'sidebar-mobile-open' : 'sidebar-desktop'}`}
        data-collapsed={sidebarCollapsed}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? 'true' : undefined}
        aria-label={sidebarOpen ? 'Navigation and account options' : undefined}
      >
        <div>
          <div className="sidebar-brand">
            {!sidebarCollapsed ? (
              <div className="sidebar-brand-expanded">
                <div className="brand-info">
                  <Link href="/dashboard" className="brand-link" aria-label="Apovo home">
                    apovo
                  </Link>
                  <span className="brand-caption">Care Concierge</span>
                </div>
                <button
                  type="button"
                  className="sidebar-collapse-btn-top"
                  onClick={() => setSidebarCollapsed(true)}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>
            ) : (
              <div className="sidebar-brand-collapsed">
                <button
                  type="button"
                  className="sidebar-collapse-btn-top"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <PanelLeftOpen size={18} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="sidebar-close-btn"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          <nav aria-label="Care Concierge Navigation" className="sidebar-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className="sidebar-nav-link"
                  data-active={item.active}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <div className="sidebar-nav-main">
                    <Icon size={19} className="sidebar-nav-icon" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </div>

                  {item.badge > 0 && (
                    <span className="sidebar-nav-badge" data-active={item.active}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer">
          {testMode.available ? (
            <label className="application-test-toggle sidebar-test-toggle">
              <span className="application-test-copy">
                <FlaskConical size={14} aria-hidden="true" />
                <span><strong>Test mode</strong><small>Fake data · Nicole only</small></span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={testMode.enabled}
                onChange={(event) => testMode.setEnabled(event.target.checked)}
                aria-label="Use synthetic Remember Betty test mode"
              />
              <span className="application-test-track" aria-hidden="true"><i /></span>
            </label>
          ) : null}
          {careEmail ? (
            <div className="sidebar-care-email">
              <span>Medical email</span>
              <strong title={careEmail}>{careEmail}</strong>
              <button type="button" onClick={handleCopyEmail} aria-label="Copy medical email address">
                {copiedEmail ? <Check size={15} /> : <Copy size={15} />}
                {copiedEmail ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : null}
          {!sidebarCollapsed ? (
            <div className="sidebar-profile-box">
              <div className="sidebar-profile">
                <strong>{patientDisplayName}</strong>
                <span><i />Active care profile</span>
              </div>
              {!demo.available ? (
                <button
                  type="button"
                  className="sidebar-clear-btn"
                  onClick={handleClearData}
                  disabled={clearingData}
                  title="Clear all stored application and profile data"
                >
                  <Trash2 size={14} />
                  <span>{clearingData ? 'Clearing…' : 'Clear data'}</span>
                </button>
              ) : null}
            </div>
          ) : (
            <div className="sidebar-profile-collapsed-box">
              <div className="sidebar-profile-collapsed" title={patientDisplayName}>
                <span className="profile-status-dot" />
              </div>
              {!demo.available ? (
                <button
                  type="button"
                  className="sidebar-clear-btn-collapsed"
                  onClick={handleClearData}
                  disabled={clearingData}
                  title="Clear all stored application and profile data"
                  aria-label="Clear all data"
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area (Spanning 100% Width) */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        {/* Top Navigation Bar: 100% width with Notifications + Medical Email on Top Right */}
        <header
          className="top-header"
          style={{
            width: '100%',
            height: '64px',
            borderBottom: '1px solid var(--line)',
            backgroundColor: 'var(--paper)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 36px',
            gap: '20px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          {/* Left: Mobile hamburger & Contextual View Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => {
                setSidebarCollapsed(false);
                setSidebarOpen(true);
              }}
              className="sidebar-hamburger"
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                padding: '6px',
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
              aria-label="Open menu"
              aria-expanded={sidebarOpen}
              aria-controls="app-navigation-drawer"
            >
              <Menu size={20} />
            </button>

            <span
              className="top-header-title"
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: '-0.015em',
              }}
            >
              {getPageTitle()}
            </span>
          </div>

          {/* Right: Pending Consent/Action Notification Pill + Medical Email Display */}
          <div
            className="top-header-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            {testMode.available ? (
              <label className="application-test-toggle">
                <span className="application-test-copy">
                  <FlaskConical size={14} aria-hidden="true" />
                  <span>
                    <strong>Test mode</strong>
                    <small>Fake data · sends only to Nicole</small>
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={testMode.enabled}
                  onChange={(event) => testMode.setEnabled(event.target.checked)}
                  aria-label="Use synthetic Remember Betty test mode"
                />
                <span className="application-test-track" aria-hidden="true"><i /></span>
              </label>
            ) : null}
            {pendingCount > 0 && (
              <Link
                href="/tasks"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  backgroundColor: 'rgba(180, 82, 109, 0.08)',
                  border: '1px solid rgba(180, 82, 109, 0.35)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--rose)',
                  textDecoration: 'none',
                  transition: 'background-color 150ms ease',
                }}
                title="Review pending questions and email reply consents"
              >
                <Bell size={14} />
                <span>
                  {pendingCount} pending {pendingCount === 1 ? 'item' : 'items'}
                </span>
              </Link>
            )}

            {careEmail && (
              <div
                className="medical-email"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--surface-soft)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 12px',
                  fontSize: '0.86rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--ink-muted)',
                    fontSize: '0.80rem',
                    fontWeight: 500,
                    borderRight: '1px solid var(--line)',
                    paddingRight: '8px',
                  }}
                >
                  <Mail size={14} style={{ color: 'var(--rose)' }} />
                  <span>Medical email</span>
                </div>

                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.84rem',
                    color: 'var(--ink)',
                    fontWeight: 500,
                  }}
                  title="Your private AgentMail medical email for grant and doctor correspondence"
                >
                  {careEmail}
                </span>

                <button
                  type="button"
                  onClick={handleCopyEmail}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: copiedEmail ? 'var(--rose)' : 'var(--ink-muted)',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    transition: 'color var(--duration-fast) ease',
                  }}
                  aria-label="Copy medical email address"
                  title="Copy medical email address"
                >
                  {copiedEmail ? (
                    <>
                      <Check size={13} style={{ color: 'var(--rose)' }} />
                      <span style={{ color: 'var(--rose)' }}>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Content Area: 100% width, no squishing */}
        <main
          className="app-main"
          style={{
            flex: 1,
            width: '100%',
            maxWidth: '100%',
            padding: '36px 48px 80px',
            margin: 0,
          }}
        >
          {children}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="mobile-bottom-link"
              data-active={item.active}
              aria-current={item.active ? 'page' : undefined}
            >
              <span className="mobile-bottom-icon">
                <Icon size={20} strokeWidth={item.active ? 2.2 : 1.7} aria-hidden="true" />
                {item.badge > 0 ? <span className="mobile-bottom-badge">{item.badge > 99 ? '99+' : item.badge}</span> : null}
              </span>
              <span>{item.mobileLabel}</span>
            </Link>
          );
        })}
      </nav>

      <style jsx global>{`
        .application-test-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 38px;
          padding: 5px 10px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--paper);
          cursor: pointer;
        }
        .application-test-toggle:has(input:checked) {
          border-color: #cf6c56;
          background: #fff4ef;
          color: #7f2f20;
        }
        .application-test-copy { display: inline-flex; align-items: center; gap: 7px; }
        .application-test-copy > span { display: grid; line-height: 1.15; }
        .application-test-copy strong { font-size: .72rem; }
        .application-test-copy small { color: var(--ink-muted); font-size: .6rem; white-space: nowrap; }
        .application-test-toggle input { position: absolute; opacity: 0; pointer-events: none; }
        .application-test-track { width: 30px; height: 18px; padding: 2px; border-radius: 999px; background: #c7c2bc; transition: background 150ms ease; }
        .application-test-track i { display: block; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 150ms ease; box-shadow: 0 1px 2px rgba(0,0,0,.18); }
        .application-test-toggle input:checked + .application-test-track { background: #b94e38; }
        .application-test-toggle input:checked + .application-test-track i { transform: translateX(12px); }
        .application-test-toggle:focus-within { outline: 2px solid #b94e38; outline-offset: 2px; }
        .app-sidebar {
          width: 260px;
          flex-shrink: 0;
          border-right: 1px solid var(--line);
          background: var(--surface-soft);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: sticky;
          top: 0;
          height: 100dvh;
          z-index: 50;
          transition: width 180ms ease;
        }
        .app-sidebar[data-collapsed='true'] { width: 76px; }
        .sidebar-brand {
          height: 64px;
          min-height: 64px;
          padding: 0 16px 0 22px;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: center;
          position: relative;
        }
        .app-sidebar[data-collapsed='true'] .sidebar-brand {
          padding: 0;
          justify-content: center;
        }
        .sidebar-brand-expanded {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }
        .sidebar-brand-collapsed {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .brand-info {
          display: flex;
          flex-direction: column;
        }
        .brand-link {
          color: var(--ink);
          font-size: 1.45rem;
          font-weight: 650;
          letter-spacing: -0.035em;
          line-height: 1;
          text-decoration: none;
        }
        .brand-caption { color: var(--ink-muted); font-size: 0.72rem; margin-top: 3px; }
        .sidebar-collapse-btn-top {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border: 1px solid var(--line);
          border-radius: var(--radius-button);
          background: var(--paper);
          color: var(--ink-muted);
          cursor: pointer;
          transition: all var(--duration-fast) ease;
          flex-shrink: 0;
        }
        .sidebar-collapse-btn-top:hover {
          color: var(--ink);
          border-color: #bcb7b1;
          background: var(--surface-soft);
        }
        .sidebar-close-btn {
          display: none;
          position: absolute;
          right: 16px;
          top: 18px;
          padding: 4px;
          border: 0;
          background: none;
          color: var(--ink-muted);
          cursor: pointer;
        }
        .sidebar-nav { padding: 16px 14px 6px; display: flex; flex-direction: column; gap: 4px; }
        .app-sidebar[data-collapsed='true'] .sidebar-nav { padding-inline: 10px; }
        .sidebar-nav-link {
          min-height: 44px;
          padding: 10px 13px;
          border: 1px solid transparent;
          border-radius: var(--radius-button);
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--ink-muted);
          font-size: 0.93rem;
          font-weight: 450;
          text-decoration: none;
          position: relative;
        }
        .sidebar-nav-link[data-active='true'] {
          color: var(--ink);
          font-weight: 600;
          background: var(--paper);
          border-color: var(--line);
        }
        .sidebar-nav-link:hover { background: var(--paper); color: var(--ink); }
        .app-sidebar[data-collapsed='true'] .sidebar-nav-link { justify-content: center; padding-inline: 0; }
        .sidebar-nav-main { display: flex; align-items: center; gap: 11px; }
        .sidebar-nav-icon { color: var(--ink-muted); flex-shrink: 0; }
        .sidebar-nav-link[data-active='true'] .sidebar-nav-icon { color: var(--rose); }
        .sidebar-nav-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 999px;
          background: rgba(180, 82, 109, 0.12);
          color: var(--rose);
          font-size: 0.73rem;
          font-weight: 600;
        }
        .sidebar-nav-badge[data-active='true'] { background: var(--rose); color: var(--paper); }
        .app-sidebar[data-collapsed='true'] .sidebar-nav-badge {
          position: absolute;
          top: 2px;
          right: 1px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          font-size: 0.62rem;
        }
        .sidebar-footer { padding: 14px 18px; border-top: 1px solid var(--line); }
        .sidebar-test-toggle, .sidebar-care-email { display: none; }
        .sidebar-care-email {
          padding: 10px;
          margin-bottom: 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--paper);
          gap: 5px;
        }
        .sidebar-care-email > span { color: var(--ink-muted); font-size: .72rem; }
        .sidebar-care-email strong { overflow: hidden; text-overflow: ellipsis; font-size: .78rem; white-space: nowrap; }
        .sidebar-care-email button { min-height: 44px; border: 0; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; background: var(--surface-soft); color: var(--ink); font: inherit; font-size: .78rem; cursor: pointer; }
        .app-sidebar[data-collapsed='true'] .sidebar-footer {
          padding: 14px 8px;
          display: flex;
          justify-content: center;
        }
        .sidebar-profile { padding: 2px 4px; display: flex; flex-direction: column; gap: 4px; }
        .sidebar-profile strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem; }
        .sidebar-profile span { display: flex; align-items: center; gap: 6px; color: var(--ink-muted); font-size: 0.75rem; }
        .sidebar-profile i { width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
        .sidebar-profile-collapsed {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }
        .profile-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
        .sidebar-profile-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sidebar-clear-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          width: 100%;
          padding: 7px 12px;
          border: 1px solid var(--line);
          border-radius: var(--radius-button);
          background: var(--paper);
          color: var(--ink-muted);
          font-size: 0.78rem;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-fast) ease;
        }
        .sidebar-clear-btn:hover:not(:disabled) {
          color: #dc2626;
          border-color: rgba(220, 38, 38, 0.35);
          background: rgba(220, 38, 38, 0.05);
        }
        .sidebar-clear-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sidebar-profile-collapsed-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .sidebar-clear-btn-collapsed {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--line);
          border-radius: var(--radius-button);
          background: var(--paper);
          color: var(--ink-muted);
          cursor: pointer;
          transition: all var(--duration-fast) ease;
        }
        .sidebar-clear-btn-collapsed:hover:not(:disabled) {
          color: #dc2626;
          border-color: rgba(220, 38, 38, 0.35);
          background: rgba(220, 38, 38, 0.05);
        }
        .sidebar-clear-btn-collapsed:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sidebar-nav-link:focus-visible, .sidebar-collapse-btn-top:focus-visible, .brand-link:focus-visible, .sidebar-clear-btn:focus-visible, .sidebar-clear-btn-collapsed:focus-visible {
          outline: 2px solid var(--rose);
          outline-offset: 2px;
        }
        .mobile-bottom-nav { display: none; }
        @media (max-width: 860px) {
          .sidebar-desktop { display: none !important; }
          .sidebar-mobile-open {
            display: flex !important;
            position: fixed !important;
            inset: 0 auto 0 0 !important;
            width: min(88vw, 320px) !important;
          }
          .sidebar-mobile-open .sidebar-close-btn { display: block !important; }
          .sidebar-collapse-btn-top { display: none !important; }
          .sidebar-hamburger { display: block !important; }
          .sidebar-hamburger, .sidebar-close-btn { min-width: 44px; min-height: 44px; }
          .top-header { gap: 10px !important; }
          .top-header-title { white-space: nowrap; }
          .top-header-actions { display: none !important; }
          .app-main { padding: 24px 20px calc(92px + env(safe-area-inset-bottom)) !important; }
          .top-header { height: 60px !important; padding: 0 14px !important; }
          .sidebar-footer { padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
          .sidebar-test-toggle { display: flex; width: 100%; justify-content: space-between; margin-bottom: 10px; }
          .sidebar-care-email { display: grid; }
          .mobile-bottom-nav {
            position: fixed;
            inset: auto 0 0;
            z-index: 60;
            min-height: 64px;
            padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
            border-top: 1px solid var(--line);
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            background: rgba(255, 255, 255, .96);
            background: color-mix(in srgb, var(--paper) 96%, transparent);
            box-shadow: 0 -8px 24px rgba(32, 32, 31, .06);
            backdrop-filter: blur(14px);
          }
          .mobile-bottom-link {
            min-width: 0;
            min-height: 56px;
            padding: 5px 2px 4px;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            color: var(--ink-muted);
            font-size: .66rem;
            font-weight: 500;
            line-height: 1.1;
            text-decoration: none;
          }
          .mobile-bottom-link[data-active='true'] { color: var(--rose-text); font-weight: 700; background: rgba(180,82,109,.07); }
          .mobile-bottom-icon { position: relative; display: grid; place-items: center; min-height: 23px; }
          .mobile-bottom-badge { position: absolute; top: -6px; left: 13px; min-width: 17px; height: 17px; padding: 0 4px; border: 2px solid var(--paper); border-radius: 999px; display: grid; place-items: center; background: var(--rose); color: white; font-size: .54rem; font-weight: 700; }
        }
        @media (max-width: 640px) {
          .medical-email { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .app-sidebar { transition: none; }
        }
      `}</style>
    </div>
  );
}
