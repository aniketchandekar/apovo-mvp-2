import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { RunRepository } from '@/lib/application-agent/run-repository';
import { applicationRunWorker } from '@/lib/application-agent/application-run-worker';

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

  const alreadyStopped = run.current_phase === 'stopped';
  const stopped = await applicationRunWorker.stop(run.id);
  if (!alreadyStopped && stopped.current_phase === 'stopped') {
    RunRepository.appendEvent(stopped.id, 'status', 'Application preparation stopped.');
  }
  return NextResponse.json({ run: stopped });
}
