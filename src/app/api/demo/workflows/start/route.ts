import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { rememberBettyDemoWorkflow } from '@workflows/remember-betty-demo';
import {
  bindWorkflowRun,
  consumeDemoBudget,
  publicDemoSessionSummary,
} from '@/lib/demo-session/budget';
import {
  readDemoSessionCookie,
  setDemoSessionCookie,
} from '@/lib/demo-session/cookie';
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

export async function POST(request: NextRequest) {
  if (!isVercelDemoMode()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const configuration = getDemoSessionConfiguration();
    const current = readDemoSessionCookie(request, configuration.signingSecret);
    if (!current) return invalidDemoSessionResponse();

    if (current.workflowRunId) {
      return NextResponse.json({
        runId: current.workflowRunId,
        workspaceUrl: workspaceUrl(current.workflowRunId),
        session: publicDemoSessionSummary(current),
        reconnected: true,
      });
    }

    const workflowBudget = consumeDemoBudget(current, 'workflow');
    if (!workflowBudget.ok) {
      return demoLimitResponse(workflowBudget.reason, workflowBudget.session);
    }
    const packetBudget = consumeDemoBudget(workflowBudget.session, 'packet');
    if (!packetBudget.ok) {
      return demoLimitResponse(packetBudget.reason, packetBudget.session);
    }

    const run = await start(rememberBettyDemoWorkflow, [
      {
        sessionId: current.sessionId,
        sessionExpiresAt: new Date(current.expiresAt * 1_000).toISOString(),
        attempt: 1,
        deliveryAvailable: current.remaining.emails > 0,
      },
    ], {
      attributes: { demo: 'remember-betty-synthetic' },
    });
    const next = bindWorkflowRun(packetBudget.session, run.runId, 1);
    const response = NextResponse.json(
      {
        runId: run.runId,
        workspaceUrl: workspaceUrl(run.runId),
        session: publicDemoSessionSummary(next),
        reconnected: false,
      },
      { status: 202 }
    );
    return setDemoSessionCookie(
      response,
      signDemoSession(next, configuration.signingSecret)
    );
  } catch (error) {
    if (error instanceof DemoSessionConfigurationError) {
      return NextResponse.json(
        { error: 'The protected demo session is not configured.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'The synthetic application workflow could not be started.' },
      { status: 503 }
    );
  }
}
