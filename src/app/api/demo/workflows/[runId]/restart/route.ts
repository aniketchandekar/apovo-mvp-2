import { NextRequest, NextResponse } from 'next/server';
import { HookNotFoundError } from 'workflow/errors';
import { getHookByToken, getRun, start } from 'workflow/api';
import {
  demoRunGuardToken,
  rememberBettyDemoWorkflow,
} from '@workflows/remember-betty-demo';
import {
  consumeDemoBudget,
  publicDemoSessionSummary,
  replaceWorkflowRun,
} from '@/lib/demo-session/budget';
import { readDemoSessionCookie, setDemoSessionCookie } from '@/lib/demo-session/cookie';
import {
  DemoSessionConfigurationError,
  getDemoSessionConfiguration,
  isVercelDemoMode,
} from '@/lib/demo-session/config';
import { demoLimitResponse, invalidDemoSessionResponse } from '@/lib/demo-session/responses';
import { signDemoSession } from '@/lib/demo-session/token';

function workspaceUrl(runId: string) {
  return `/applications/remember-betty-foundation/workspace?run=${encodeURIComponent(runId)}&demo=1`;
}

async function findAttemptOwner(token: string) {
  try {
    return (await getHookByToken(token)).runId;
  } catch (error) {
    if (HookNotFoundError.is(error)) return null;
    throw error;
  }
}

async function resolveAttemptOwner(token: string, fallbackRunId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ownerRunId = await findAttemptOwner(token);
    if (ownerRunId) return ownerRunId;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return fallbackRunId;
}

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/demo/workflows/[runId]/restart'>
) {
  if (!isVercelDemoMode()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const { runId } = await context.params;
    const configuration = getDemoSessionConfiguration();
    const current = readDemoSessionCookie(request, configuration.signingSecret);
    if (!current) return invalidDemoSessionResponse();
    if (current.workflowRunId !== runId) {
      return NextResponse.json({ error: 'Workflow run not found.' }, { status: 404 });
    }

    const previous = getRun(runId);
    if (!(await previous.exists)) {
      return NextResponse.json({ error: 'Workflow run not found.' }, { status: 404 });
    }
    const previousStatus = await previous.status;
    if (previousStatus === 'running' || previousStatus === 'pending') {
      return NextResponse.json(
        { error: 'Finish the current synthetic workflow before starting over.', code: 'RUN_ACTIVE' },
        { status: 409 }
      );
    }

    const workflowBudget = consumeDemoBudget(current, 'workflow');
    if (!workflowBudget.ok) {
      return demoLimitResponse(workflowBudget.reason, workflowBudget.session);
    }
    const packetBudget = consumeDemoBudget(workflowBudget.session, 'packet');
    if (!packetBudget.ok) {
      return demoLimitResponse(packetBudget.reason, packetBudget.session);
    }

    const attempt = 2 as const;
    const guardToken = demoRunGuardToken(current.sessionId, attempt);
    let nextRunId = await findAttemptOwner(guardToken);
    if (!nextRunId) {
      const started = await start(rememberBettyDemoWorkflow, [
        {
          sessionId: current.sessionId,
          sessionExpiresAt: new Date(current.expiresAt * 1_000).toISOString(),
          attempt,
          deliveryAvailable: current.remaining.emails > 0,
        },
      ], {
        attributes: { demo: 'remember-betty-synthetic-restart' },
      });
      nextRunId = await resolveAttemptOwner(guardToken, started.runId);
    }
    const next = replaceWorkflowRun(packetBudget.session, runId, nextRunId);
    const response = NextResponse.json(
      {
        runId: nextRunId,
        workspaceUrl: workspaceUrl(nextRunId),
        session: publicDemoSessionSummary(next),
      },
      { status: 202 }
    );
    return setDemoSessionCookie(response, signDemoSession(next, configuration.signingSecret));
  } catch (error) {
    if (error instanceof DemoSessionConfigurationError) {
      return NextResponse.json(
        { error: 'The protected demo session is not configured.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'The synthetic workflow could not be restarted.' },
      { status: 503 }
    );
  }
}
