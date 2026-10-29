import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const taskId = searchParams.get('id');

    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return NextResponse.json({
        tasks: [],
        total: 0,
        counts: { open: 0, consent: 0, data: 0, completed: 0 },
        patient_id: null,
        care_email: null,
      });
    }

    const allUnified = ApovoStore.getUnifiedPendingItems(patient.id);

    if (taskId) {
      const task = allUnified.find((t) => t.id === taskId) || ApovoStore.getTask(taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    const openItems = allUnified.filter((t) => t.status === 'open');
    const consentItems = openItems.filter(
      (t) =>
        t.type === 'consent_reply' ||
        t.type === 'approve_followup' ||
        t.type === 'approve_submit' ||
        Boolean(t.draft_id)
    );
    const dataItems = openItems.filter(
      (t) =>
        t.type !== 'consent_reply' &&
        t.type !== 'approve_followup' &&
        t.type !== 'approve_submit' &&
        !t.draft_id
    );
    const completedItems = allUnified.filter((t) => t.status !== 'open');

    let filtered = allUnified;
    if (status === 'open') {
      filtered = openItems;
    } else if (status === 'answered') {
      filtered = allUnified.filter((t) => t.status === 'answered');
    } else if (status === 'skipped') {
      filtered = allUnified.filter((t) => t.status === 'skipped');
    } else if (status === 'completed') {
      filtered = completedItems;
    }

    if (category === 'consent') {
      filtered = filtered.filter(
        (t) =>
          t.type === 'consent_reply' ||
          t.type === 'approve_followup' ||
          t.type === 'approve_submit' ||
          Boolean(t.draft_id)
      );
    } else if (category === 'data') {
      filtered = filtered.filter(
        (t) =>
          t.type !== 'consent_reply' &&
          t.type !== 'approve_followup' &&
          t.type !== 'approve_submit' &&
          !t.draft_id
      );
    }

    return NextResponse.json({
      tasks: filtered,
      total: filtered.length,
      counts: {
        open: openItems.length,
        consent: consentItems.length,
        data: dataItems.length,
        completed: completedItems.length,
      },
      patient_id: patient.id,
      care_email: patient.care_email || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch tasks';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return NextResponse.json({ error: 'No active patient profile' }, { status: 404 });
    }

    if (!body.title || !body.program_name) {
      return NextResponse.json(
        { error: 'title and program_name are required' },
        { status: 400 }
      );
    }

    const task = ApovoStore.createTask({
      patient_id: patient.id,
      application_id: body.application_id || '',
      program_name: body.program_name,
      asker: body.asker || `${body.program_name} · Form Agent`,
      type: body.type || 'text',
      title: body.title,
      why: body.why || 'Required to process your grant application.',
      shared_with: body.shared_with || `${body.program_name} Review Team`,
      field_key: body.field_key,
      options: body.options,
      thread_id: body.thread_id,
      message_id: body.message_id,
      draft_id: body.draft_id,
      deadline: body.deadline,
    });

    return NextResponse.json({ success: true, task });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create task';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
