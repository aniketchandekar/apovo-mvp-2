import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { RunRepository } from '@/lib/application-agent/run-repository';
import { applicationRunWorker } from '@/lib/application-agent/application-run-worker';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const patient = ApovoStore.getActivePatient();
  const run = RunRepository.get(runId);

  if (!patient || !run || run.patient_id !== patient.id) {
    return NextResponse.json({ error: 'Application run not found.' }, { status: 404 });
  }

  return NextResponse.json({ run, isActive: applicationRunWorker.isActive(run.id) });
}
