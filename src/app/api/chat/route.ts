import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { isGeminiConfigured, getGeminiModel } from '@/lib/integrations/gemini/config';
import { askApovoConcierge } from '@/lib/integrations/gemini/chat-service';

export async function GET() {
  return NextResponse.json({
    configured: isGeminiConfigured(),
    model: getGeminiModel(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
    }

    const patient = ApovoStore.getActivePatient();
    const userId = patient?.id || 'patient_guest';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : `session_${userId}`;

    const result = await askApovoConcierge({
      message,
      userId,
      sessionId,
    });

    return NextResponse.json({
      reply: result.reply,
      source: result.source,
      model: result.model || getGeminiModel(),
      configured: isGeminiConfigured(),
      error: result.error,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Internal chat error';
    console.error('[API /api/chat] Error:', error);
    return NextResponse.json(
      {
        error: errorMsg,
        reply: 'I ran into an issue processing that message. Please try asking again.',
        source: 'local_concierge',
        configured: isGeminiConfigured(),
      },
      { status: 500 }
    );
  }
}
