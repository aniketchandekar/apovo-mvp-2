'use client';

import dynamic from 'next/dynamic';
import { Download, ExternalLink, FileText } from 'lucide-react';
import type { DemoWorkflowEvent } from '@/lib/demo-workflow/types';

type Packet = NonNullable<DemoWorkflowEvent['packet']>;

const PdfCanvasViewer = dynamic(
  () => import('./PdfCanvasViewer').then((module) => module.PdfCanvasViewer),
  {
    ssr: false,
    loading: () => <div className="pdf-module-loading">Loading secure PDF viewer…</div>,
  }
);

export function DemoPacketPreview({ runId, packet }: { runId: string; packet: Packet }) {
  const url = `/api/demo/workflows/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(packet.artifactId)}`;

  return (
    <section className="demo-packet" aria-labelledby="demo-packet-heading">
      <div className="packet-toolbar">
        <div>
          <FileText size={15} />
          <strong id="demo-packet-heading">Filled PDF</strong>
          <span>{packet.pageCount} pages</span>
        </div>
        <nav aria-label="PDF actions">
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open protected PDF"><ExternalLink size={14} /> <span>Open</span></a>
          <a href={url} download="apovo-remember-betty-synthetic-demo.pdf" aria-label="Download protected PDF"><Download size={14} /> <span>Download</span></a>
        </nav>
      </div>
      <div className="packet-viewport">
        <PdfCanvasViewer url={url} expectedPageCount={packet.pageCount} />
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
        .packet-viewport { min-height: 0; overflow: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; }
        .pdf-module-loading { min-height: 100%; display: grid; place-items: center; color: #6f6b67; font-size: .8rem; }
        .packet-meta { margin: 8px 4px 0; color: #6f6b67; font-size: .7rem; line-height: 1.4; }
        @media (max-width: 720px) {
          .demo-packet { padding: 8px; grid-template-rows: 44px minmax(0, 1fr) auto; }
          .packet-toolbar span { display: none; }
          a { min-width: 44px; min-height: 44px; justify-content: center; padding: 0 9px; }
          nav a span { display: none; }
          .packet-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
      `}</style>
    </section>
  );
}
