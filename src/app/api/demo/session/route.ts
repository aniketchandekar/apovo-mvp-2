import { NextRequest, NextResponse } from 'next/server';
import { publicDemoSessionSummary } from '../../../../lib/demo-session/budget';
import {
  clearDemoSessionCookie,
  readDemoSessionCookie,
  setDemoSessionCookie,
} from '../../../../lib/demo-session/cookie';
import {
  DemoSessionConfigurationError,
  getDemoSessionConfiguration,
  isVercelDemoMode,
} from '../../../../lib/demo-session/config';
import { createDemoSession, signDemoSession } from '../../../../lib/demo-session/token';

function unavailable() {
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

function configurationError() {
  return NextResponse.json(
    { error: 'The protected demo session is not configured.' },
    { status: 503 }
  );
}

export async function GET(request: NextRequest) {
  if (!isVercelDemoMode()) return unavailable();
  try {
    const configuration = getDemoSessionConfiguration();
    const session = readDemoSessionCookie(request, configuration.signingSecret);
    if (!session) {
      return clearDemoSessionCookie(
        NextResponse.json(
          { error: 'Start a new demo session to continue.', code: 'SESSION_INVALID' },
          { status: 401 }
        )
      );
    }
    return NextResponse.json({ session: publicDemoSessionSummary(session) });
  } catch (error) {
    if (error instanceof DemoSessionConfigurationError) return configurationError();
    return clearDemoSessionCookie(
      NextResponse.json(
        { error: 'Start a new demo session to continue.', code: 'SESSION_INVALID' },
        { status: 401 }
      )
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isVercelDemoMode()) return unavailable();
  try {
    const configuration = getDemoSessionConfiguration();
    try {
      const existing = readDemoSessionCookie(request, configuration.signingSecret);
      if (existing) {
        return NextResponse.json({ session: publicDemoSessionSummary(existing) });
      }
    } catch {
      // Invalid or expired cookies are replaced with a fresh bounded session.
    }

    const session = createDemoSession();
    const response = NextResponse.json(
      { session: publicDemoSessionSummary(session) },
      { status: 201 }
    );
    return setDemoSessionCookie(
      response,
      signDemoSession(session, configuration.signingSecret)
    );
  } catch (error) {
    if (error instanceof DemoSessionConfigurationError) return configurationError();
    return configurationError();
  }
}

export async function DELETE() {
  if (!isVercelDemoMode()) return unavailable();
  try {
    const configuration = getDemoSessionConfiguration();
    const session = createDemoSession();
    const response = NextResponse.json(
      { session: publicDemoSessionSummary(session) },
      { status: 201 }
    );
    return setDemoSessionCookie(
      response,
      signDemoSession(session, configuration.signingSecret)
    );
  } catch (error) {
    if (error instanceof DemoSessionConfigurationError) return configurationError();
    return configurationError();
  }
}
