import { NextResponse } from 'next/server';
import { publicDemoSessionSummary, type DemoBudgetFailureReason } from './budget';
import type { DemoSession } from './types';

export function demoLimitResponse(reason: DemoBudgetFailureReason, session: DemoSession) {
  return NextResponse.json(
    {
      error:
        reason === 'SESSION_EXPIRED'
          ? 'This 15-minute demo session has expired.'
          : 'This demo session limit has been reached.',
      code: reason,
      session: publicDemoSessionSummary(session),
    },
    { status: 429 }
  );
}

export function invalidDemoSessionResponse() {
  return NextResponse.json(
    { error: 'Start a new demo session to continue.', code: 'SESSION_INVALID' },
    { status: 401 }
  );
}
