import { NextRequest, NextResponse } from 'next/server';
import { createDemoChatHandler } from '../../../../lib/demo-session/chat-handler';
import {
  getDemoSessionConfiguration,
  isVercelDemoMode,
} from '../../../../lib/demo-session/config';

export async function POST(request: NextRequest) {
  if (!isVercelDemoMode()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  try {
    const configuration = getDemoSessionConfiguration();
    return createDemoChatHandler({ signingSecret: configuration.signingSecret })(request);
  } catch {
    return NextResponse.json(
      { error: 'The protected AI demo is not configured.' },
      { status: 503 }
    );
  }
}
