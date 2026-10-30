import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
import {
  DEMO_PACKET_STREAM,
  type DemoPacketArtifact,
} from '@/lib/demo-workflow/types';
import { readDemoSessionCookie } from '@/lib/demo-session/cookie';
import {
  getDemoSessionConfiguration,
  isVercelDemoMode,
} from '@/lib/demo-session/config';
import { invalidDemoSessionResponse } from '@/lib/demo-session/responses';

const MAX_PACKET_BYTES = 5 * 1024 * 1024;

async function readPacketArtifact(runId: string) {
  const run = getRun(runId);
  if (!(await run.exists)) return null;
  const reader = run
    .getReadable<DemoPacketArtifact>({ namespace: DEMO_PACKET_STREAM, startIndex: 0 })
    .getReader();
  try {
    const { value, done } = await reader.read();
    return done ? null : value;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function validPacket(artifact: DemoPacketArtifact, artifactId: string) {
  if (
    artifact.artifactId !== artifactId ||
    artifact.byteLength < 8 ||
    artifact.byteLength > MAX_PACKET_BYTES ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  ) {
    return null;
  }
  const bytes = Uint8Array.from(Buffer.from(artifact.base64, 'base64'));
  if (
    bytes.byteLength !== artifact.byteLength ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-' ||
    createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
  ) {
    return null;
  }
  return bytes;
}

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/demo/workflows/[runId]/artifacts/[artifactId]'>
) {
  if (!isVercelDemoMode()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const { runId, artifactId } = await context.params;
    const configuration = getDemoSessionConfiguration();
    const session = readDemoSessionCookie(request, configuration.signingSecret);
    if (!session) return invalidDemoSessionResponse();
    if (session.workflowRunId !== runId) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const artifact = await readPacketArtifact(runId);
    const bytes = artifact ? validPacket(artifact, artifactId) : null;
    if (!bytes) {
      return NextResponse.json({ error: 'PDF artifact not found.' }, { status: 404 });
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': 'inline; filename="apovo-remember-betty-synthetic-demo.pdf"',
        'Cache-Control': 'private, no-store, no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'The PDF preview is temporarily unavailable.' },
      { status: 503 }
    );
  }
}

export const HEAD = GET;
