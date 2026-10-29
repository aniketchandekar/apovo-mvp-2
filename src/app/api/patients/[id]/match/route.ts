import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const applications = ApovoStore.matchInitialPrograms(id);
    return NextResponse.json({ applications, success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to match programs';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
