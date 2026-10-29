import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { RunRepository } from '@/lib/application-agent/run-repository';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const patient = ApovoStore.getActivePatient();
  const run = RunRepository.get(runId);
  if (!patient || !run || run.patient_id !== patient.id) {
    return NextResponse.json({ error: 'Application run not found.' }, { status: 404 });
  }

  const afterValue = new URL(request.url).searchParams.get('after');
  const afterSequence = Math.max(0, Number.parseInt(afterValue || '0', 10) || 0);
  const events = RunRepository.events(run.id, afterSequence);

  return NextResponse.json({ events, lastSequence: events.at(-1)?.sequence || afterSequence });
}
