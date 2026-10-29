import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return NextResponse.json({ error: 'No active patient profile' }, { status: 404 });
    }

    let application = ApovoStore.getApplication(id);
    if (!application) {
      // Auto-match if not found
      ApovoStore.matchInitialPrograms(patient.id);
      application = ApovoStore.getApplication(id);
    }

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const tasks = ApovoStore.getTasks(patient.id).filter(
      (t) => t.application_id === application!.id || t.program_name === application!.resource.name
    );

    const events = ApovoStore.getEvents(patient.id).filter(
      (e) => e.application_id === application!.id || e.title.includes(application!.resource.name)
    );

    return NextResponse.json({
      application,
      tasks,
      events,
      success: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch application';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (body.state === 'Submitted') {
      return NextResponse.json(
        { error: 'Submission requires a confirmed fax or postal delivery receipt.' },
        { status: 409 }
      );
    }
    const updated = ApovoStore.updateApplication(id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    return NextResponse.json({ application: updated, success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update application';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
