'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, RotateCw } from 'lucide-react';
import type { DemoWorkflowEvent } from '@/lib/demo-workflow/types';

type Packet = NonNullable<DemoWorkflowEvent['packet']>;

export function DemoPacketPreview({ runId, packet }: { runId: string; packet: Packet }) {
  const [previewState, setPreviewState] = useState<'checking' | 'loading' | 'ready' | 'error'>('checking');
  const [attempt, setAttempt] = useState(0);
  const url = `/api/demo/workflows/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(packet.artifactId)}`;

  useEffect(() => {
    const controller = new AbortController();
    async function checkPreview() {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok || response.headers.get('content-type') !== 'application/pdf') {
          throw new Error('PDF preview unavailable');
        }
        setPreviewState('loading');
      } catch {
        if (!controller.signal.aborted) setPreviewState('error');
      }
    }
    void checkPreview();
    return () => controller.abort();
  }, [attempt, url]);

  return (
    <section className="demo-packet" aria-labelledby="demo-packet-heading">
      <div className="packet-toolbar">
        <div>
          <FileText size={15} />
          <strong id="demo-packet-heading">Filled PDF</strong>
          <span>{packet.pageCount} pages</span>
        </div>
        <nav aria-label="PDF actions">
          <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
          <a href={url} download="apovo-remember-betty-synthetic-demo.pdf"><Download size={14} /> Download</a>
        </nav>
      </div>
      <div className="packet-viewport" data-loaded={previewState === 'ready'}>
        {previewState === 'error' ? (
          <div className="packet-error" role="alert">
            <strong>The filled PDF could not be displayed.</strong>
            <span>Your workflow is still safe. Check your connection and try the preview again.</span>
            <button type="button" onClick={() => { setPreviewState('checking'); setAttempt((current) => current + 1); }}><RotateCw size={14} /> Retry preview</button>
          </div>
        ) : null}
        {previewState === 'checking' || previewState === 'loading' ? <div className="packet-loading">Preparing secure PDF preview…</div> : null}
        {previewState === 'loading' || previewState === 'ready' ? (
          <iframe
            key={`${packet.artifactId}-${attempt}`}
            src={url}
            title="Filled synthetic Remember Betty application packet"
            onLoad={() => setPreviewState('ready')}
          />
        ) : null}
      </div>
      <p className="packet-meta">
        {(packet.byteLength / 1024).toFixed(0)} KB · visibly marked synthetic · protected test artifact
      </p>
      <style jsx>{`
        .demo-packet { min-width: 0; height: 100%; padding: 12px; display: grid; grid-template-rows: 42px minmax(0, 1fr) auto; background: #eeece9; }
        .packet-toolbar { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 4px; }
        .packet-toolbar > div, nav, a { display: inline-flex; align-items: center; gap: 7px; }
        .packet-toolbar strong { font-size: .8rem; }
        .packet-toolbar span { color: #77716c; font-size: .68rem; }
        nav { gap: 6px; }
        a { min-height: 34px; padding: 0 10px; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; color: #3d3b39; font-size: .71rem; text-decoration: none; }
        .packet-viewport { position: relative; min-height: 0; overflow: hidden; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; }
        iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; opacity: 0; }
        .packet-viewport[data-loaded='true'] iframe { opacity: 1; }
        .packet-loading { position: absolute; inset: 0; display: grid; place-items: center; color: #6f6b67; font-size: .8rem; }
        .packet-error { position: absolute; inset: 0; padding: 28px; display: grid; place-content: center; justify-items: center; gap: 7px; text-align: center; }
        .packet-error strong { font-size: .9rem; }
        .packet-error span { max-width: 380px; color: #6f6b67; font-size: .76rem; line-height: 1.5; }
        .packet-error button { min-height: 40px; margin-top: 5px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; color: #3d3b39; font: inherit; font-size: .72rem; cursor: pointer; }
        .packet-meta { margin: 8px 4px 0; color: #6f6b67; font-size: .7rem; line-height: 1.4; }
        @media (max-width: 720px) {
          .demo-packet { padding: 8px; grid-template-rows: 44px minmax(0, 1fr) auto; }
          .packet-toolbar span { display: none; }
          a { min-width: 44px; min-height: 44px; justify-content: center; padding: 0 9px; }
          a:first-child { display: none; }
          .packet-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
      `}</style>
    </section>
  );
}
