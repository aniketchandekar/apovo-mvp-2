import { NextResponse } from 'next/server';
import { isVercelDemoMode } from '../../../lib/demo-session/config';

function syntheticDemoDashboard() {
  return NextResponse.json({
    patient: {
      id: 'demo_ava_testperson',
      first_name: 'Ava',
      last_name: 'Testperson',
      diagnosis: 'Synthetic breast cancer test fixture',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    applications: [],
    startedGrants: [],
    events: [],
    openTasks: [],
    openTasksCount: 0,
    pendingItemsCount: 0,
    unreadEmailsCount: 0,
    agentRun: null,
    capabilities: { applicationTestMode: true },
    stats: { secured: 0, inProgress: 0, followUps: 0, hoursSaved: 0 },
    syntheticDemo: true,
  });
}

export async function GET() {
  if (isVercelDemoMode()) return syntheticDemoDashboard();
  const { ApovoStore } = await import('../../../lib/store');
  const capabilities = {
    applicationTestMode: process.env.APOVO_APPLICATION_TEST_MODE === '1',
  };
  const patient = ApovoStore.getActivePatient();
  if (!patient) {
    return NextResponse.json({
      patient: null,
      applications: [],
      startedGrants: [],
      events: [],
      openTasks: [],
      openTasksCount: 0,
      pendingItemsCount: 0,
      unreadEmailsCount: 0,
      agentRun: null,
      capabilities,
      stats: { secured: 0, inProgress: 0, followUps: 0, hoursSaved: 0 },
    });
  }

  let applications = ApovoStore.matchInitialPrograms(patient.id);
  applications = ApovoStore.getApplications(patient.id);
  const startedGrants = ApovoStore.getStartedGrantsSummary(patient.id);

  const events = ApovoStore.getEvents(patient.id).slice(0, 5);
  const openTasks = ApovoStore.getOpenTasks(patient.id);
  const unifiedOpen = ApovoStore.getUnifiedPendingItems(patient.id).filter(
    (item) => item.status === 'open'
  );
  const inboxThreads = ApovoStore.getThreads(patient.id, 'inbox');
  const unreadEmailsCount = inboxThreads.reduce((acc, t) => acc + t.unreadCount, 0);
  const agentRun = ApovoStore.getActiveAgentRun();

  const secured = applications
    .filter((a) => a.state === 'Approved' || a.state === 'BenefitReceived')
    .reduce((sum, a) => sum + (a.benefit_value || 0), 0);

  const inProgress = applications.filter((a) =>
    [
      'Matched',
      'Drafting',
      'NeedsPatientInput',
      'AwaitingPatientApproval',
      'Submitted',
      'AwaitingResponse',
    ].includes(a.state)
  ).length;

  const followUps = applications.filter(
    (a) => a.state === 'FollowUpSent' || a.state === 'AwaitingResponse'
  ).length;

  return NextResponse.json({
    patient,
    applications,
    startedGrants,
    events,
    openTasks,
    openTasksCount: openTasks.length,
    pendingItemsCount: unifiedOpen.length,
    unreadEmailsCount,
    agentRun,
    capabilities,
    stats: {
      secured,
      inProgress: startedGrants.length || inProgress,
      followUps,
      hoursSaved: 0,
    },
  });
}
