'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileText, Mail } from 'lucide-react';
import type { DemoWorkflowEvent } from '@/lib/demo-workflow/types';

type Packet = NonNullable<DemoWorkflowEvent['packet']>;

function packetBlob(packet: Packet) {
  const decoded = window.atob(packet.base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'application/pdf' });
}

export function DemoPacketPreview({
  packet,
  awaitingApproval,
  approving,
  emailSpent,
  onApprove,
}: {
  packet: Packet;
  awaitingApproval: boolean;
  approving: boolean;
  emailSpent: boolean;
  onApprove: () => Promise<void>;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let objectUrl = '';
    const timeout = window.setTimeout(() => {
      objectUrl = URL.createObjectURL(packetBlob(packet));
      setUrl(objectUrl);
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [packet]);

  return (
    <section className="demo-packet" aria-labelledby="demo-packet-heading">
      <div className="packet-toolbar">
        <div><FileText size={16} /><strong id="demo-packet-heading">Synthetic packet</strong></div>
        {url ? <a href={url} download="apovo-remember-betty-synthetic-demo.pdf"><Download size={15} /> Download</a> : null}
      </div>
      {url ? <iframe src={url} title="Synthetic Remember Betty application packet" /> : <div className="packet-loading">Preparing preview…</div>}
      <aside className="send-confirmation" aria-label="Test email confirmation">
        <div className="confirmation-copy">
          <span><Mail size={16} /> One test email</span>
          <strong>Send this fake-data packet to Nicole?</strong>
          <p>Nothing is submitted to Remember Betty. The recipient is fixed on the server and cannot be edited.</p>
        </div>
        {awaitingApproval ? (
          <button
            type="button"
            onClick={() => void onApprove()}
            disabled={approving || emailSpent}
          >
            <CheckCircle2 size={17} /> {approving ? 'Confirming…' : 'Confirm and send test email'}
          </button>
        ) : (
          <span className="confirmation-state">{emailSpent ? 'Email attempt used' : 'Waiting for the workflow…'}</span>
        )}
      </aside>
      <p className="packet-meta">{packet.pageCount} pages · {(packet.byteLength / 1024).toFixed(0)} KB · visibly marked synthetic</p>
      <style jsx>{`
        .demo-packet { min-width: 0; height: 100%; padding: 16px; display: grid; grid-template-rows: 44px minmax(360px, 1fr) auto auto; background: #eeece9; }
        .packet-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 4px; }
        .packet-toolbar div, .packet-toolbar a, .confirmation-copy > span { display: inline-flex; align-items: center; gap: 7px; }
        .packet-toolbar strong { font-size: .82rem; }
        .packet-toolbar a { min-height: 36px; padding: 0 11px; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; color: #3d3b39; font-size: .73rem; text-decoration: none; }
        iframe, .packet-loading { width: 100%; height: 100%; min-height: 360px; border: 1px solid #d8d4cf; border-radius: 8px; background: #fff; }
        .packet-loading { display: grid; place-items: center; color: #6f6b67; font-size: .8rem; }
        .send-confirmation { margin-top: 12px; padding: 14px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; border: 1px solid #e2c5ba; border-radius: 10px; background: #fff8f4; }
        .confirmation-copy { min-width: 0; display: grid; gap: 3px; }
        .confirmation-copy > span { color: #8b3524; font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
        .confirmation-copy strong { font-size: .88rem; }
        .confirmation-copy p, .packet-meta { margin: 0; color: #6f6b67; font-size: .72rem; line-height: 1.45; }
        button { min-height: 44px; padding: 0 15px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: 8px; background: #8b3524; color: #fff; font: inherit; font-size: .76rem; font-weight: 650; cursor: pointer; white-space: nowrap; }
        button:disabled { opacity: .55; cursor: wait; }
        .confirmation-state { color: #6f6b67; font-size: .74rem; white-space: nowrap; }
        .packet-meta { padding: 8px 4px 0; }
        @media (max-width: 720px) {
          .demo-packet { height: auto; padding: 12px; grid-template-rows: 44px minmax(420px, 62dvh) auto auto; }
          .send-confirmation { grid-template-columns: 1fr; gap: 12px; }
          button { width: 100%; min-height: 48px; white-space: normal; }
        }
      `}</style>
    </section>
  );
}
