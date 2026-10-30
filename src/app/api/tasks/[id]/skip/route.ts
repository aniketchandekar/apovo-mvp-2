import { NextRequest, NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { isVercelDemoMode } from '@/lib/demo-session/config';
import { DEMO_TASK_ID, demoTasks } from '@/lib/demo-session/fixtures';
import {
  appendUnique,
  demoStateResponse,
  requireDemoSession,
  updateDemoUiState,
  without,
} from '@/lib/demo-session/state';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (isVercelDemoMode()) {
      const auth = requireDemoSession(req);
      if (auth.error) return auth.error;
      if (id !== DEMO_TASK_ID) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      const next = updateDemoUiState(auth.session, (ui) => ({
        ...ui,
        skippedTaskIds: appendUnique(ui.skippedTaskIds, id),
        answeredTaskIds: without(ui.answeredTaskIds, id),
      }));
      return demoStateResponse(
        {
          success: true,
          task: demoTasks(next.ui)[0],
          message: 'Item skipped in this demo session.',
        },
        next
      );
    }
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
