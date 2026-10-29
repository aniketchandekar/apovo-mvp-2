import { NextResponse } from 'next/server';
import { publicInput } from '@/lib/application-agent/input-validation';
import { ownedRun } from '@/lib/application-agent/run-access';
import { RunRepository } from '@/lib/application-agent/run-repository';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const owned = ownedRun(runId);
  if (!owned) return NextResponse.json({ error: 'Application run not found.' }, { status: 404 });

  const inputs = RunRepository.inputs(runId).map(publicInput);
  return NextResponse.json({
    inputs,
    openCount: inputs.filter((input) => input.status === 'open').length,
  });
}
