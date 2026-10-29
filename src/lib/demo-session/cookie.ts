import type { NextRequest, NextResponse } from 'next/server';
import { DEMO_SESSION_DURATION_SECONDS } from './config';
import { verifyDemoSession } from './token';

export const DEMO_SESSION_COOKIE = 'apovo_demo_session';

export function demoSessionCookieOptions(production = process.env.NODE_ENV === 'production') {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: DEMO_SESSION_DURATION_SECONDS,
    priority: 'high' as const,
  };
}

export function readDemoSessionCookie(request: NextRequest, secret: string, now = Date.now()) {
  const token = request.cookies.get(DEMO_SESSION_COOKIE)?.value;
  return token ? verifyDemoSession(token, secret, now) : null;
}

export function setDemoSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(DEMO_SESSION_COOKIE, token, demoSessionCookieOptions());
  return response;
}

export function clearDemoSessionCookie(response: NextResponse) {
  response.cookies.set(DEMO_SESSION_COOKIE, '', {
    ...demoSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
