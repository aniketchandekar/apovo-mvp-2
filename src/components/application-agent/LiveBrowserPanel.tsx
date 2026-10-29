'use client';

import { useEffect, useState } from 'react';
import { Expand, Globe2, LockKeyhole, X } from 'lucide-react';
import type { ApplicationRun } from '@/lib/application-agent/types';

export function LiveBrowserPanel({
  run,
}: {
  run: Pick<ApplicationRun, 'state' | 'current_phase' | 'live_view_url'>;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const hasLiveView = ['active', 'waiting_for_patient'].includes(run.state) && Boolean(run.live_view_url);
  const isPaused = run.state === 'waiting_for_patient';
  const discoveryDone = ['inspecting_pdf', 'provisioning_care_email', 'mapping_fields', 'waiting_for_patient', 'filling_pdf', 'assembling_packet', 'awaiting_patient_review', 'applying_patient_signature', 'packet_ready'].includes(run.current_phase);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setFullscreen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [fullscreen]);

  return (
    <section className="browser-panel" aria-labelledby="browser-heading">
      <div className="browser-chrome">
        <div className="browser-title">
          <i className="live-dot" data-paused={isPaused} aria-hidden="true" />
          <Globe2 size={15} aria-hidden="true" />
          <span id="browser-heading">{isPaused ? 'Browser paused' : 'Agent working'}</span>
        </div>
        <div className="browser-address"><LockKeyhole size={12} /> rememberbetty.com</div>
        <div className="browser-tools">
          <span className="read-only"><LockKeyhole size={11} /> Read only</span>
          {hasLiveView ? (
            <button type="button" className="expand-browser" onClick={() => setFullscreen(true)} aria-label="View secure browser full screen">
              <Expand size={16} /> <span>Full screen</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="browser-viewport">
        {hasLiveView && !fullscreen ? (
          <div className="live-frame">
            <iframe
              src={run.live_view_url}
              title="Apovo agent browser live view"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              tabIndex={-1}
            />
            <div className="interaction-shield" aria-hidden="true" />
            {isPaused ? <div className="paused-overlay"><strong>Paused for your answer</strong><span>Use Actions required to continue.</span></div> : null}
          </div>
        ) : (
          <div className="browser-empty">
            <div className="status-mark"><Globe2 size={22} /></div>
            <h2>{discoveryDone ? 'Website review complete' : run.state === 'failed' ? 'Browser could not connect' : run.state === 'stopped' ? 'Browser session closed' : 'Opening the secure browser'}</h2>
            <p>{discoveryDone ? 'Apovo closed the browser after securely downloading the application.' : run.state === 'failed' ? 'Review the activity log for the next step.' : run.state === 'stopped' ? 'No browser session is active.' : 'The live view will appear here when the session connects.'}</p>
          </div>
        )}
      </div>
      {fullscreen && hasLiveView ? (
        <div className="browser-fullscreen" role="dialog" aria-modal="true" aria-label="Secure browser full-screen view">
          <div className="fullscreen-toolbar">
            <div>
              <strong>{isPaused ? 'Browser paused' : 'Live agent browser'}</strong>
              <span><LockKeyhole size={12} /> Read only · rememberbetty.com</span>
            </div>
            <button type="button" onClick={() => setFullscreen(false)} autoFocus aria-label="Close full-screen browser">
              <X size={20} /> <span>Close</span>
            </button>
          </div>
          <div className="fullscreen-frame">
            <iframe
              src={run.live_view_url}
              title="Apovo agent browser full-screen live view"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              tabIndex={-1}
            />
            <div className="interaction-shield" aria-hidden="true" />
            {isPaused ? <div className="paused-overlay"><strong>Paused for your answer</strong><span>Close this view and open Actions required.</span></div> : null}
          </div>
        </div>
      ) : null}
      <style jsx>{`
        .browser-panel { min-width: 0; height: 100%; padding: 18px; background: #eeece9; display: grid; grid-template-rows: 44px minmax(0,1fr); }
        .browser-chrome { display: grid; grid-template-columns: auto minmax(180px, 520px) auto; gap: 18px; align-items: center; padding: 0 4px; }
        .browser-title { display: flex; align-items: center; gap: 8px; font-size: .77rem; font-weight: 600; white-space: nowrap; }
        .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #177245; box-shadow: 0 0 0 3px rgba(23,114,69,.1); }
        .live-dot[data-paused='true'] { background: #9a5a12; box-shadow: 0 0 0 3px rgba(154,90,18,.1); }
        .browser-address { justify-self: center; width: 100%; display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 28px; border: 1px solid #d8d4cf; background: #fff; color: #6f6b67; border-radius: 6px; font-size: .72rem; }
        .browser-tools { display: flex; align-items: center; gap: 8px; }
        .read-only { display: inline-flex; align-items: center; gap: 4px; font-size: .7rem; color: #6f6b67; white-space: nowrap; }
        .expand-browser { min-height: 36px; padding: 0 10px; border: 1px solid #d8d4cf; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #3d3b39; font: inherit; font-size: .72rem; cursor: pointer; }
        .browser-viewport { min-height: 420px; overflow: hidden; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; }
        .live-frame { position: relative; width: 100%; height: 100%; }
        iframe { width: 100%; height: 100%; border: 0; background: #fff; }
        .interaction-shield { position: absolute; inset: 0; cursor: not-allowed; }
        .paused-overlay { position: absolute; inset: auto 12px 12px; padding: 10px 12px; border: 1px solid #f0d9b5; border-radius: 8px; display: grid; gap: 2px; background: rgba(255,248,235,.96); color: #6f3d08; pointer-events: none; }
        .paused-overlay strong { font-size: .8rem; }
        .paused-overlay span { font-size: .72rem; }
        .browser-empty { height: 100%; display: grid; place-content: center; justify-items: center; text-align: center; padding: 36px; }
        .status-mark { width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid #e7e3df; border-radius: 50%; color: #b4526d; margin-bottom: 18px; }
        h2 { font-size: 1.05rem; margin-bottom: 7px; }
        p { max-width: 390px; font-size: .84rem; line-height: 1.5; }
        .browser-fullscreen { position: fixed; inset: 0; z-index: 100; width: 100%; height: 100dvh; padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); display: grid; grid-template-rows: auto minmax(0, 1fr); background: #20201f; }
        .fullscreen-toolbar { min-height: 64px; padding: 8px 12px 8px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; background: #fff; }
        .fullscreen-toolbar > div { min-width: 0; display: grid; gap: 2px; }
        .fullscreen-toolbar strong { font-size: .9rem; }
        .fullscreen-toolbar span { display: inline-flex; align-items: center; gap: 5px; color: #6f6b67; font-size: .72rem; }
        .fullscreen-toolbar button { min-height: 44px; padding: 0 12px; border: 1px solid #d8d4cf; border-radius: 8px; display: inline-flex; align-items: center; gap: 7px; background: #fff; color: #20201f; font: inherit; font-size: .8rem; cursor: pointer; }
        .fullscreen-frame { position: relative; min-height: 0; background: #fff; }
        @media (max-width: 720px) {
          .browser-panel { height: auto; padding: 12px; grid-template-rows: auto auto; gap: 10px; }
          .browser-chrome { grid-template-columns: 1fr auto; gap: 10px; min-height: 44px; }
          .browser-address { display: none; }
          .browser-tools { justify-self: end; }
          .read-only { display: none; }
          .expand-browser { min-height: 44px; }
          .expand-browser span { display: none; }
          .browser-viewport { min-height: 0; aspect-ratio: 16 / 9; }
        }
      `}</style>
    </section>
  );
}
