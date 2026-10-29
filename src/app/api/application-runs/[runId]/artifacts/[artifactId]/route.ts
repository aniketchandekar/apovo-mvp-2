import { NextResponse } from 'next/server';
import { localArtifactStore } from '@/lib/artifacts/local-artifact-store';
import { ApplicationRunError } from '@/lib/application-agent/errors';
import { ownedRun } from '@/lib/application-agent/run-access';
import { RunRepository } from '@/lib/application-agent/run-repository';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; artifactId: string }> }
) {
  const { runId, artifactId } = await params;
  const owned = ownedRun(runId);
  if (!owned) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const artifact = RunRepository.artifact(artifactId);
  if (!artifact || artifact.run_id !== runId) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  try {
    const bytes = localArtifactStore.readPdf(artifact, {
      runId,
      patientId: owned.patient.id,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': 'inline; filename="application-packet.pdf"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ApplicationRunError) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Document unavailable.' }, { status: 500 });
  }
}
