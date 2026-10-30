import { NextRequest, NextResponse } from 'next/server';
import { getDemoSessionConfiguration } from './config';
import { readDemoSessionCookie, setDemoSessionCookie } from './cookie';
import { invalidDemoSessionResponse } from './responses';
import { signDemoSession } from './token';
import type { DemoSession, DemoUiState } from './types';

export function readDemoSessionOrNull(request: NextRequest): DemoSession | null {
  try {
    const { signingSecret } = getDemoSessionConfiguration();
    return readDemoSessionCookie(request, signingSecret);
  } catch {
    return null;
  }
}

export function requireDemoSession(
  request: NextRequest
): { session: DemoSession; error?: never } | { session?: never; error: NextResponse } {
  const session = readDemoSessionOrNull(request);
  return session ? { session } : { error: invalidDemoSessionResponse() };
}

export function updateDemoUiState(
  session: DemoSession,
  update: (current: DemoUiState) => DemoUiState
): DemoSession {
  return {
    ...session,
    sequence: session.sequence + 1,
    ui: update(session.ui),
  };
}

export function demoStateResponse(
  payload: Record<string, unknown>,
  session: DemoSession,
  init?: ResponseInit
) {
  const { signingSecret } = getDemoSessionConfiguration();
  return setDemoSessionCookie(
    NextResponse.json(payload, init),
    signDemoSession(session, signingSecret)
  );
}

export function appendUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

export function without(values: string[], value: string) {
  return values.filter((item) => item !== value);
}
