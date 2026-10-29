import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { AgentMailError } from '@/lib/integrations/agentmail/client';
import {
  assertIntegrationTestAccess,
  CareEmailIntegrationTestError,
  INTEGRATION_TEST_RECIPIENT,
  runCareEmailIntegrationTest,
} from '@/lib/integrations/agentmail/integration-test';
import { EmailComposerError } from '@/lib/integrations/gemini/email-composer';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    confirmation?: string;
    recipient?: string;
  };

  try {
    assertIntegrationTestAccess({
      enabled: process.env.APOVO_EMAIL_TEST_MODE === '1',
      confirmation: body.confirmation,
      recipient: body.recipient,
    });

    const patient = ApovoStore.getActivePatient();
    const inboxId = patient?.agentmail_inbox_id || process.env.AGENTMAIL_INBOX_ID?.trim() || '';
    const result = await runCareEmailIntegrationTest({
      inboxId,
      recipient: INTEGRATION_TEST_RECIPIENT,
    });

    let localRecordSaved = false;
    if (patient) {
      try {
        ApovoStore.saveEmail({
          patient_id: patient.id,
          program_name: 'Apovo Integration Test',
          inbox_id: inboxId,
          thread_id: result.threadId,
          message_id: result.messageId,
          direction: 'outbound',
          from: patient.care_email || inboxId,
          to: result.recipient,
          subject: result.subject,
          body_text: result.text,
          body_html: '',
          classification: 'unrelated',
          summary: `Synthetic Gemini and AgentMail attachment test ${result.testRunId}`,
          labels: ['apovo_integration_test'],
          delivery_status: 'sent',
          unread: false,
        });
        localRecordSaved = true;
      } catch {
        localRecordSaved = false;
      }
    }

    return NextResponse.json({ success: true, ...result, localRecordSaved });
  } catch (error) {
    if (error instanceof CareEmailIntegrationTestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AgentMailError || error instanceof EmailComposerError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: 'The email integration test could not be completed.' },
      { status: 500 }
    );
  }
}
