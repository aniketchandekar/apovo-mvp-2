'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Globe2 } from 'lucide-react';
import type { ApplicationRun } from '@/lib/application-agent/types';
import { LiveBrowserPanel } from './LiveBrowserPanel';
import { PdfPacketPreview } from './PdfPacketPreview';

type WorkspaceTab = 'browser' | 'pdf';

function hasFilledPdf(run: ApplicationRun) {
  return Boolean(
    run.test_packet_artifact_id ||
    run.final_packet_artifact_id ||
    run.unsigned_packet_artifact_id ||
    run.draft_pdf_artifact_id
  );
}

export function ApplicationWorkspaceViewer({ run }: { run: ApplicationRun }) {
  const pdfAvailable = hasFilledPdf(run);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('browser');
  const sawPdf = useRef(false);

  useEffect(() => {
    if (pdfAvailable && !sawPdf.current) {
      sawPdf.current = true;
      setActiveTab('pdf');
    }
  }, [pdfAvailable]);

  const selectedTab = activeTab === 'pdf' && pdfAvailable ? 'pdf' : 'browser';
  const browserActive = run.state === 'active' && Boolean(run.live_view_url);

  return (
    <section className="workspace-viewer" aria-label="Application workspace views">
      <div className="browser-tabs" role="tablist" aria-label="Workspace views">
        <button
          type="button"
          role="tab"
          aria-selected={selectedTab === 'browser'}
          aria-controls="application-browser-panel"
          id="application-browser-tab"
          onClick={() => setActiveTab('browser')}
        >
          <Globe2 size={13} /> Live browser
          <i data-live={browserActive} aria-hidden="true" />
        </button>
        {pdfAvailable ? (
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === 'pdf'}
            aria-controls="application-pdf-panel"
            id="application-pdf-tab"
            onClick={() => setActiveTab('pdf')}
          >
            <FileText size={13} /> Filled PDF
            <span>Ready</span>
          </button>
        ) : null}
      </div>
      <div className="viewer-surface">
        {selectedTab === 'pdf' ? (
          <div id="application-pdf-panel" role="tabpanel" aria-labelledby="application-pdf-tab" className="tab-panel">
            <PdfPacketPreview run={run} />
          </div>
        ) : (
          <div id="application-browser-panel" role="tabpanel" aria-labelledby="application-browser-tab" className="tab-panel">
            <LiveBrowserPanel run={run} />
          </div>
        )}
      </div>
      <style jsx>{`
        .workspace-viewer { min-width: 0; min-height: 0; height: 100%; padding: 12px 12px 12px 0; display: grid; grid-template-rows: 36px minmax(0, 1fr); background: #dcd9d5; }
        .browser-tabs { min-width: 0; display: flex; align-items: end; gap: 3px; padding: 0 10px; }
        button { position: relative; min-width: 142px; height: 32px; padding: 0 12px; display: inline-flex; align-items: center; gap: 7px; border: 1px solid #c9c4be; border-bottom: 0; border-radius: 9px 9px 0 0; background: #cbc7c2; color: #605b56; font: inherit; font-size: .72rem; cursor: pointer; }
        button[aria-selected='true'] { height: 35px; background: #eeece9; color: #292725; z-index: 1; }
        button i { margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: #918c86; }
        button i[data-live='true'] { background: #177245; box-shadow: 0 0 0 3px rgba(23,114,69,.1); }
        button span { margin-left: auto; padding: 2px 5px; border-radius: 999px; background: #f7e7e1; color: #8b3524; font-size: .58rem; font-weight: 700; }
        .viewer-surface { min-width: 0; min-height: 0; overflow: hidden; border: 1px solid #c9c4be; border-radius: 8px; background: #eeece9; }
        .tab-panel { width: 100%; height: 100%; min-height: 0; }
        @media (max-width: 820px) {
          .workspace-viewer { min-height: 68dvh; padding: 7px; grid-template-rows: 40px minmax(0, 1fr); }
          .browser-tabs { padding: 0 5px; }
          button { min-width: 0; flex: 1; height: 36px; justify-content: center; }
          button[aria-selected='true'] { height: 39px; }
          button i, button span { margin-left: 0; }
        }
      `}</style>
    </section>
  );
}
