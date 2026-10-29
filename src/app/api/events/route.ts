import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get('appId');
    const agent = searchParams.get('agent');
    const type = searchParams.get('type');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    const patient = ApovoStore.getActivePatient();
    if (!patient) return NextResponse.json({ events: [], total: 0, applications: [] });
    let events = ApovoStore.getEvents(patient.id);

    if (appId && appId !== 'all') {
      events = events.filter((e) => e.application_id === appId || (e.metadata?.program && String(e.metadata.program).toLowerCase().includes(appId.toLowerCase())));
    }

    if (agent && agent !== 'all') {
      events = events.filter((e) => e.agent === agent);
    }

    if (type && type !== 'all') {
      events = events.filter((e) => e.type === type);
    }

    if (limit && limit > 0) {
      events = events.slice(0, limit);
    }

    // Also get applications list for filter dropdown
    const applications = ApovoStore.getApplications(patient.id);

    return NextResponse.json({
      events,
      total: events.length,
      applications: applications.map((a) => ({ id: a.id, name: a.resource.name, resource_id: a.resource_id })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch timeline events';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
