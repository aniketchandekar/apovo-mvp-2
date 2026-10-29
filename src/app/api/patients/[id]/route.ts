import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patient = ApovoStore.getPatient(id);
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }
  return NextResponse.json({ patient });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const patient = ApovoStore.updatePatient(id, body);
    return NextResponse.json({ patient, success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update patient';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
