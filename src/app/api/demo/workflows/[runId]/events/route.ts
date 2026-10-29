import { NextRequest, NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
import type { DemoWorkflowEvent } from '@/lib/demo-workflow/types';
import { readDemoSessionCookie } from '@/lib/demo-session/cookie';
import {
  getDemoSessionConfiguration,
  isVercelDemoMode,
} from '@/lib/demo-session/config';
import { invalidDemoSessionResponse } from '@/lib/demo-session/responses';

function ndjson() {
  return new TransformStream<DemoWorkflowEvent, string>({
    transform(event, controller) {
      controller.enqueue(`${JSON.stringify(event)}\n`);
    },
  });
}

function requestedStartIndex(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('startIndex');
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10_000 ? parsed : 0;
}

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/demo/workflows/[runId]/events'>
) {
  if (!isVercelDemoMode()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const { runId } = await context.params;
    const configuration = getDemoSessionConfiguration();
    const session = readDemoSessionCookie(request, configuration.signingSecret);
    if (!session) return invalidDemoSessionResponse();
    if (session.workflowRunId !== runId) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const run = getRun(runId);
    if (!(await run.exists)) {
      return NextResponse.json({ error: 'Workflow run not found.' }, { status: 404 });
    }
    const stream = run
      .getReadable<DemoWorkflowEvent>({ startIndex: requestedStartIndex(request) })
      .pipeThrough(ndjson());
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Workflow activity is temporarily unavailable.' },
      { status: 503 }
    );
  }
}
