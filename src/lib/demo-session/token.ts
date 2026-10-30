import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DEMO_SESSION_DURATION_SECONDS } from './config';
import { demoSessionSchema, type DemoSession } from './types';

const MAX_TOKEN_BYTES = 2_048;

export class DemoSessionTokenError extends Error {
  constructor(message = 'The demo session is invalid or expired.') {
    super(message);
    this.name = 'DemoSessionTokenError';
  }
}

function signatureFor(encodedPayload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(encodedPayload).digest();
}

export function createDemoSession(input: {
  now?: number;
  sessionId?: string;
} = {}): DemoSession {
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1_000);
  return {
    version: 1,
    sessionId: input.sessionId || `demo_${randomUUID()}`,
    issuedAt,
    expiresAt: issuedAt + DEMO_SESSION_DURATION_SECONDS,
    sequence: 0,
    remaining: {
      chatTurns: 10,
      workflows: 1,
      retries: 2,
      packets: 1,
      emails: 1,
    },
    ui: {
      answeredTaskIds: [],
      skippedTaskIds: [],
      starredThreadIds: [],
      readThreadIds: [],
      unreadThreadIds: [],
      sentThreadIds: [],
    },
  };
}

export function signDemoSession(session: DemoSession, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const signature = signatureFor(encodedPayload, secret).toString('base64url');
  const token = `${encodedPayload}.${signature}`;
  if (Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) {
    throw new DemoSessionTokenError('The demo session token is too large.');
  }
  return token;
}

export function verifyDemoSession(
  token: string,
  secret: string,
  now: number = Date.now()
): DemoSession {
  if (!token || Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) {
    throw new DemoSessionTokenError();
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new DemoSessionTokenError();
  }

  const expected = signatureFor(parts[0], secret);
  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[1], 'base64url');
  } catch {
    throw new DemoSessionTokenError();
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new DemoSessionTokenError();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new DemoSessionTokenError();
  }
  const parsed = demoSessionSchema.safeParse(decoded);
  if (!parsed.success) throw new DemoSessionTokenError();
  if (Math.floor(now / 1_000) >= parsed.data.expiresAt) {
    throw new DemoSessionTokenError();
  }
  return parsed.data;
}
