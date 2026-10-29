import { after, NextResponse } from 'next/server';
import { ApplicationRunError } from '@/lib/application-agent/errors';
import { publicInput, validateInputAnswer } from '@/lib/application-agent/input-validation';
import { applicationRunWorker } from '@/lib/application-agent/application-run-worker';
import { continueAfterPatientInput, ownedRun } from '@/lib/application-agent/run-access';
import { RunRepository } from '@/lib/application-agent/run-repository';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; inputId: string }> }
) {
  const { runId, inputId } = await params;
  const owned = ownedRun(runId);
  if (!owned) return NextResponse.json({ error: 'Application run not found.' }, { status: 404 });

  const input = RunRepository.inputs(runId).find((item) => item.id === inputId);
  if (!input) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  if (input.status !== 'open') {
    return NextResponse.json({ input: publicInput(input), alreadyAnswered: true });
  }

  const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
  try {
    const answer = validateInputAnswer(input, body.answer);
    const answered = RunRepository.answerInput(input.id, answer);
    if (!answered) return NextResponse.json({ error: 'Question is no longer open.' }, { status: 409 });

    if (continueAfterPatientInput(runId)) {
      after(async () => {
        await applicationRunWorker.start(runId);
      });
    }
    return NextResponse.json({ input: publicInput(answered) });
  } catch (error) {
    if (error instanceof ApplicationRunError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'The answer could not be saved.' }, { status: 500 });
  }
}
