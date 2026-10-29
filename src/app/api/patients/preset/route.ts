import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function POST(req: Request) {
  try {
    const { preset } = (await req.json().catch(() => ({}))) as { preset?: string };

    if (preset === 'reset' || preset === 'clear') {
      ApovoStore.clearAllData();
      return NextResponse.json({ success: true, patient: null });
    }

    const patient = ApovoStore.setPatientPreset(preset || 'jane-doe');
    return NextResponse.json({ success: true, patient });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to switch preset';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
