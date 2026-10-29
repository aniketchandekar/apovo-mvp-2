import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function POST() {
  try {
    ApovoStore.clearAllData();
    return NextResponse.json({ success: true, message: 'All local data and artifacts have been cleared.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear data';
    console.error('[API /api/data/clear] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
