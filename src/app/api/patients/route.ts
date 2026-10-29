import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function GET() {
  const patient = ApovoStore.getActivePatient();
  return NextResponse.json({ patient });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const patient = ApovoStore.createPatient(body);
    return NextResponse.json({ patient, success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create patient';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
