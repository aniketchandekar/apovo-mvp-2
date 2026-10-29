import { NextRequest, NextResponse } from 'next/server';
import { isGeminiConfigured } from '../integrations/gemini/config';
import {
  askSyntheticDemoConcierge,
  type DemoChatResult,
} from '../integrations/gemini/demo-chat-service';
import { consumeDemoBudget, publicDemoSessionSummary } from './budget';
import {
  clearDemoSessionCookie,
  readDemoSessionCookie,
  setDemoSessionCookie,
} from './cookie';
import { demoLimitResponse, invalidDemoSessionResponse } from './responses';
import { signDemoSession } from './token';

interface DemoChatDependencies {
  signingSecret: string;
  configured?: () => boolean;
  ask?: (message: string, sessionId: string) => Promise<DemoChatResult>;
}

export function createDemoChatHandler(dependencies: DemoChatDependencies) {
  const configured = dependencies.configured || isGeminiConfigured;
  const ask =
    dependencies.ask ||
    ((message: string) => askSyntheticDemoConcierge(message));

  return async function handleDemoChat(request: NextRequest) {
    let session;
    try {
      session = readDemoSessionCookie(request, dependencies.signingSecret);
    } catch {
      return clearDemoSessionCookie(invalidDemoSessionResponse());
    }
    if (!session) return invalidDemoSessionResponse();
    if (!configured()) {
      return NextResponse.json(
        { error: 'Gemini is not configured for the protected demo.' },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 2_000) {
      return NextResponse.json(
        { error: 'Message must contain 1 to 2,000 characters.' },
        { status: 400 }
      );
    }

    const consumed = consumeDemoBudget(session, 'chat');
    if (!consumed.ok) return demoLimitResponse(consumed.reason, consumed.session);
    const rotatedToken = signDemoSession(consumed.session, dependencies.signingSecret);

    try {
      const result = await ask(message, consumed.session.sessionId);
      return setDemoSessionCookie(
        NextResponse.json({
          ...result,
          configured: true,
          session: publicDemoSessionSummary(consumed.session),
        }),
        rotatedToken
      );
    } catch {
      return setDemoSessionCookie(
        NextResponse.json(
          {
            error: 'The AI demo could not answer this turn. Please try a shorter question.',
            code: 'AI_REQUEST_FAILED',
            session: publicDemoSessionSummary(consumed.session),
          },
          { status: 502 }
        ),
        rotatedToken
      );
    }
  };
}
