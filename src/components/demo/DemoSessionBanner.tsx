'use client';

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Timer } from 'lucide-react';
import { useDemoSession } from './DemoSessionProvider';

function remainingLabel(expiresAt: string, now: number, fallbackSeconds: number) {
  const seconds =
    now === 0
      ? fallbackSeconds
      : Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function DemoSessionBanner() {
  const demo = useDemoSession();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!demo.available || !demo.session?.active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [demo.available, demo.session?.active]);

  const time = useMemo(
    () =>
      demo.session
        ? remainingLabel(demo.session.expiresAt, now, demo.session.secondsRemaining)
        : '0:00',
    [demo.session, now]
  );

  if (!demo.available || !demo.session) return null;
  return (
    <aside className="demo-session-banner" role="status" aria-live="polite">
      <span><FlaskConical size={14} /> Synthetic live demo</span>
      <strong>Do not enter real personal or medical information</strong>
      <span><Timer size={14} /> {demo.session.active ? time : 'Expired'}</span>
      <style jsx>{`
        .demo-session-banner { position: fixed; z-index: 250; top: calc(8px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); max-width: calc(100vw - 24px); min-height: 34px; padding: 6px 10px; display: flex; align-items: center; gap: 10px; border: 1px solid #e1a36f; border-radius: 999px; background: rgba(255,248,238,.97); color: #713d16; box-shadow: 0 6px 24px rgba(61,40,20,.12); font-size: .7rem; white-space: nowrap; }
        span { display: inline-flex; align-items: center; gap: 5px; }
        strong { overflow: hidden; text-overflow: ellipsis; font-size: .68rem; }
        @media (max-width: 640px) {
          .demo-session-banner { top: auto; bottom: calc(76px + env(safe-area-inset-bottom)); width: calc(100vw - 24px); justify-content: space-between; }
          strong { display: none; }
        }
      `}</style>
    </aside>
  );
}
