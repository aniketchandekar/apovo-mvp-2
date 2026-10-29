import { after, NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { RunRepository } from '@/lib/application-agent/run-repository';
import { applicationRunWorker } from '@/lib/application-agent/application-run-worker';
import { continueAfterPatientInput } from '@/lib/application-agent/run-access';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const patient = ApovoStore.getActivePatient();
  const run = RunRepository.get(runId);
  if (!patient || !run || run.patient_id !== patient.id) {
    return NextResponse.json({ error: 'Application run not found.' }, { status: 404 });
  }
  if (['packet_ready', 'failed', 'stopped'].includes(run.state)) {
    return NextResponse.json({ error: 'This application run cannot be resumed.' }, { status: 409 });
  }
  if (applicationRunWorker.isActive(run.id)) {
    return NextResponse.json({ run, alreadyActive: true });
  }

  if (run.current_phase === 'waiting_for_patient' && !continueAfterPatientInput(run.id)) {
    return NextResponse.json(
      { error: 'Answer the open questions before resuming.', run },
      { status: 409 }
    );
  }

  after(async () => {
    await applicationRunWorker.start(run.id);
  });
  return NextResponse.json({ run, resumed: true }, { status: 202 });
}
