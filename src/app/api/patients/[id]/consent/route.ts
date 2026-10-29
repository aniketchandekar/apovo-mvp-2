import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { signature, version } = await req.json();

    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: 'Signature is required' }, { status: 400 });
    }

    const patient = ApovoStore.saveConsent(id, signature.trim(), version || 'v1.0');
    return NextResponse.json({ patient, success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to record consent';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
