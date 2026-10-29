import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || '';

    const task = ApovoStore.skipTask(id, reason);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      task,
      message: 'Task skipped. Form Agent notified.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to skip task';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
