import type {
  DemoBudgetAction,
  DemoSession,
  PublicDemoSessionSummary,
} from './types';

const BUDGET_KEYS = {
  chat: 'chatTurns',
  workflow: 'workflows',
  retry: 'retries',
  packet: 'packets',
  email: 'emails',
} as const;

export type DemoBudgetFailureReason = 'SESSION_EXPIRED' | 'LIMIT_REACHED';

export type ConsumeDemoBudgetResult =
  | { ok: true; session: DemoSession }
  | { ok: false; reason: DemoBudgetFailureReason; session: DemoSession };

export function consumeDemoBudget(
  session: DemoSession,
  action: DemoBudgetAction,
  now: number = Date.now()
): ConsumeDemoBudgetResult {
  if (Math.floor(now / 1_000) >= session.expiresAt) {
    return { ok: false, reason: 'SESSION_EXPIRED', session };
  }

  const key = BUDGET_KEYS[action];
  if (session.remaining[key] <= 0) {
    return { ok: false, reason: 'LIMIT_REACHED', session };
  }

  return {
    ok: true,
    session: {
      ...session,
      sequence: session.sequence + 1,
      remaining: {
        ...session.remaining,
        [key]: session.remaining[key] - 1,
      },
    },
  };
}

export function bindWorkflowRun(
  session: DemoSession,
  workflowRunId: string,
  workflowAttempt = 1
): DemoSession {
  if (session.workflowRunId && session.workflowRunId !== workflowRunId) {
    throw new Error('This demo session is already bound to another workflow.');
  }
  return { ...session, workflowRunId, workflowAttempt };
}

export function replaceWorkflowRun(
  session: DemoSession,
  expectedRunId: string,
  workflowRunId: string
): DemoSession {
  if (session.workflowRunId !== expectedRunId || session.workflowAttempt >= 2) {
    throw new Error('This demo session cannot replace its current workflow.');
  }
  return {
    ...session,
    workflowRunId,
    workflowAttempt: session.workflowAttempt + 1,
  };
}

export function publicDemoSessionSummary(
  session: DemoSession,
  now: number = Date.now()
): PublicDemoSessionSummary {
  const secondsRemaining = Math.max(0, session.expiresAt - Math.floor(now / 1_000));
  return {
    active: secondsRemaining > 0,
    expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
    secondsRemaining,
    remaining: { ...session.remaining },
    workflowBound: Boolean(session.workflowRunId),
    canRestartWorkflow:
      Boolean(session.workflowRunId) &&
      session.workflowAttempt < 2 &&
      session.remaining.workflows > 0 &&
      session.remaining.packets > 0,
  };
}
