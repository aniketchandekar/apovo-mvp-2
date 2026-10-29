import { after, NextResponse } from 'next/server';
import { localArtifactStore } from '@/lib/artifacts/local-artifact-store';
import { applicationRunWorker } from '@/lib/application-agent/application-run-worker';
import { publicInput } from '@/lib/application-agent/input-validation';
import { continueAfterPatientInput, ownedRun } from '@/lib/application-agent/run-access';
import { RunRepository } from '@/lib/application-agent/run-repository';
import { inspectPdf } from '@/lib/pdf/inspect-pdf';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_DIAGNOSIS_LETTER_PAGES = 4;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const owned = ownedRun(runId);
  if (!owned) return NextResponse.json({ error: 'Application run not found.' }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const inputId = form?.get('inputId');
  const file = form?.get('file');
  if (typeof inputId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a PDF file to upload.' }, { status: 400 });
  }

  const input = RunRepository.inputs(runId).find((item) => item.id === inputId);
  if (!input || input.input_type !== 'file' || input.status !== 'open') {
    return NextResponse.json({ error: 'This document question is not open.' }, { status: 409 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'The PDF must be smaller than 10 MB.' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const inspection = await inspectPdf(bytes);
    if (inspection.pageCount > MAX_DIAGNOSIS_LETTER_PAGES) {
      return NextResponse.json(
        { error: `The diagnosis letter must be ${MAX_DIAGNOSIS_LETTER_PAGES} pages or fewer so the packet stays within the 8-page limit.` },
        { status: 400 }
      );
    }

    const artifact = localArtifactStore.savePdf({
      runId,
      patientId: owned.patient.id,
      kind: 'diagnosis_letter',
      bytes,
      pageCount: inspection.pageCount,
    });
    RunRepository.saveArtifact(artifact);
    const answered = RunRepository.answerInput(input.id, { artifactId: artifact.id });
    if (!answered) return NextResponse.json({ error: 'This document question is no longer open.' }, { status: 409 });

    if (continueAfterPatientInput(runId)) {
      after(async () => {
        await applicationRunWorker.start(runId);
      });
    }
    return NextResponse.json({
      input: publicInput(answered),
      artifact: { id: artifact.id, pageCount: artifact.page_count, byteSize: artifact.byte_size },
    });
  } catch {
    return NextResponse.json(
      { error: 'The file must be a readable, unencrypted PDF.' },
      { status: 400 }
    );
  }
}
