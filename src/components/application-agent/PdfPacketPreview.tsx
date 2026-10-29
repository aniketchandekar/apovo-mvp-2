import { Download, FileText } from 'lucide-react';
import type { ApplicationRun } from '@/lib/application-agent/types';

export function PdfPacketPreview({ run }: { run: ApplicationRun }) {
  const artifactId =
    run.test_packet_artifact_id ||
    run.unsigned_packet_artifact_id ||
    run.draft_pdf_artifact_id ||
    run.source_pdf_artifact_id;
  if (!artifactId) return null;
  const url = `/api/application-runs/${encodeURIComponent(run.id)}/artifacts/${encodeURIComponent(artifactId)}`;
  const isTestPacket = Boolean(run.test_packet_artifact_id);
  const isPacket = isTestPacket || Boolean(run.unsigned_packet_artifact_id);
  const isDraft = !isPacket && Boolean(run.draft_pdf_artifact_id);
  const title = isTestPacket
    ? 'Synthetic test packet'
    : isPacket
      ? 'Application packet'
      : isDraft
        ? 'Filled application'
        : 'Downloaded application';

  return (
    <section className="packet-panel" aria-labelledby="packet-heading">
      <div className="packet-chrome">
        <div className="packet-title"><FileText size={15} /><span id="packet-heading">{title}</span></div>
        <a href={url} download="remember-betty-application.pdf" className="packet-download"><Download size={14} /> Download</a>
      </div>
      <iframe key={artifactId} src={url} title="Your Remember Betty application PDF" className="packet-frame" />
      <p className="packet-note">
        {isTestPacket
          ? run.state === 'test_email_sent'
            ? 'Test email sent only to Nicole. This unsigned packet uses fake data and was not submitted to Remember Betty.'
            : run.current_phase === 'test_email_delivery_uncertain'
              ? 'Delivery status is uncertain. Do not resend automatically; reconcile the AgentMail draft and message first.'
              : 'This unsigned packet uses fake data and is marked test-only. It will be emailed only to Nicole.'
          : isPacket
          ? 'Review every page. Nothing has been emailed, faxed, or submitted. The applicant must personally sign the form; Remember Betty accepts packets only by fax or mail, not email.'
          : isDraft
            ? 'This is your filled application. Review it while Apovo prepares the supporting documents. Nothing has been submitted.'
            : 'This is the official application Apovo just downloaded. Answer the questions in the Actions required tab so Apovo can fill it for you.'}
      </p>
      <style jsx>{`
        .packet-panel { min-width: 0; height: 100%; padding: 18px; background: #eeece9; display: grid; grid-template-rows: 44px minmax(0,1fr) auto; }
        .packet-chrome { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 4px; }
        .packet-title { display: flex; align-items: center; gap: 8px; font-size: .8rem; font-weight: 600; }
        .packet-download { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid #d8d4cf; border-radius: 6px; background: #fff; color: #3d3b39; font-size: .74rem; text-decoration: none; }
        .packet-frame { width: 100%; height: 100%; min-height: 420px; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; }
        .packet-note { margin: 10px 4px 0; font-size: .72rem; line-height: 1.5; color: #6f6b67; }
      `}</style>
    </section>
  );
}
