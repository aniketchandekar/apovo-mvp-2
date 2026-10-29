import { NextRequest, NextResponse } from 'next/server';
import { HookNotFoundError } from 'workflow/errors';
import { resumeHook } from 'workflow/api';
import { demoApprovalToken } from '@workflows/remember-betty-demo';
import {
  consumeDemoBudget,
  publicDemoSessionSummary,
} from '@/lib/demo-session/budget';
import {
  readDemoSessionCookie,
  setDemoSessionCookie,
} from '@/lib/demo-session/cookie';
import {
  getDemoSessionConfiguration,
  isVercelDemoMode,
} from '@/lib/demo-session/config';
import { demoLimitResponse, invalidDemoSessionResponse } from '@/lib/demo-session/responses';
import { signDemoSession } from '@/lib/demo-session/token';

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/demo/workflows/[runId]/approve'>
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

    const emailBudget = consumeDemoBudget(session, 'email');
    if (!emailBudget.ok) {
      return demoLimitResponse(emailBudget.reason, emailBudget.session);
    }

    try {
      const resumed = await resumeHook<{ approved: boolean }>(
        demoApprovalToken(session.sessionId),
        { approved: true }
      );
      if (resumed.runId !== runId) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      }
    } catch (error) {
      if (HookNotFoundError.is(error)) {
        return NextResponse.json(
          { error: 'The packet is not awaiting approval.' },
          { status: 409 }
        );
      }

      const uncertain = NextResponse.json(
        {
          accepted: false,
          code: 'APPROVAL_UNCERTAIN',
          error: 'Approval could not be confirmed. The demo will not accept another email attempt.',
          session: publicDemoSessionSummary(emailBudget.session),
        },
        { status: 202 }
      );
      return setDemoSessionCookie(
        uncertain,
        signDemoSession(emailBudget.session, configuration.signingSecret)
      );
    }

    const response = NextResponse.json({
      accepted: true,
      session: publicDemoSessionSummary(emailBudget.session),
    });
    return setDemoSessionCookie(
      response,
      signDemoSession(emailBudget.session, configuration.signingSecret)
    );
  } catch {
    return NextResponse.json(
      { error: 'The email approval could not be processed.' },
      { status: 503 }
    );
  }
}
