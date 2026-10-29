import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { AgentMailError } from '@/lib/integrations/agentmail/client';
import { provisionPatientInbox } from '@/lib/integrations/agentmail/care-inbox';
import { ApplicationRunError } from '@/lib/application-agent/errors';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await req.json().catch(() => ({}));
    const patient = ApovoStore.getPatient(id);

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (patient.care_email && patient.agentmail_inbox_id === patient.care_email) {
      return NextResponse.json({ patient, email: patient.care_email, success: true });
    }

    try {
      const inbox = await provisionPatientInbox(patient);
      const { patient: updatedPatient, email } = ApovoStore.assignCareInbox(
        id,
        inbox.email,
        inbox.inboxId
      );
      return NextResponse.json({ patient: updatedPatient, email, success: true });
    } catch (error) {
      if (error instanceof ApplicationRunError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      if (error instanceof AgentMailError) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      return NextResponse.json(
        { error: 'AgentMail could not be reached; no inbox was created.' },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Failed to allocate care inbox' }, { status: 500 });
  }
}
