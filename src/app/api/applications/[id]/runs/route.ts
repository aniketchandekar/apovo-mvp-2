import { after, NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { RunRepository } from '@/lib/application-agent/run-repository';
import { applicationRunWorker } from '@/lib/application-agent/application-run-worker';
import { getResourceCatalog } from '@/lib/resource-catalog';
import {
  deliveryModeFor,
  testRunCreationMetadata,
} from '@/lib/application-agent/test-mode-policy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let patient = ApovoStore.getActivePatient();
  if (!patient) {
    patient = ApovoStore.createPatient({
      first_name: 'Patient',
      last_name: 'Member',
      diagnosis: 'Breast Cancer',
      status: 'active',
      consent_at: new Date().toISOString(),
      consent_signature: 'Patient Member',
    });
  }

  let application = ApovoStore.getApplication(id);
  if (!application) {
    ApovoStore.matchInitialPrograms(patient.id);
    application = ApovoStore.getApplication(id);
  }

  if (!application) {
    const catalog = getResourceCatalog(patient);
    const resource = catalog.find((r) => r.id === id || id.includes(r.id)) || catalog[0];
    const appId = `app_${resource.id}_${patient.id}`;
    application = ApovoStore.upsertApplication({
      id: appId,
      patient_id: patient.id,
      resource_id: resource.id,
      resource,
      state: 'Drafting',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else if (application.state === 'Matched') {
    application =
      ApovoStore.updateApplication(application.id, { state: 'Drafting' }) || application;
  }

  if (!application || application.patient_id !== patient.id) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    restart?: boolean;
    testMode?: boolean;
  };
  let creationOptions: Parameters<typeof RunRepository.createOrGet>[3] = {
    deliveryMode: 'prepare_only',
  };
  if (body.testMode) {
    if (application.resource_id !== 'remember-betty') {
      return NextResponse.json(
        { error: 'Synthetic test mode is available only for Remember Betty.' },
        { status: 400 }
      );
    }
    try {
      const metadata = testRunCreationMetadata();
      creationOptions = {
        deliveryMode: metadata.delivery_mode,
        testRecipient: metadata.test_recipient,
        syntheticFixtureVersion: metadata.synthetic_fixture_version,
      };
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Application test mode is unavailable.' },
        { status: 403 }
      );
    }
  }
  if (body.restart) {
    const active = ApovoStore.getActiveApplicationRun(application.id, patient.id);
    if (active) {
      await applicationRunWorker.stop(active.id);
      RunRepository.appendEvent(active.id, 'status', 'Stopped the previous run to start over.');
    }
  }

  let run;
  try {
    run = RunRepository.createOrGet(
      application.id,
      patient.id,
      application.resource?.url,
      creationOptions
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('RUN_MODE_CONFLICT:')) {
      const [, existingRunId, existingMode] = error.message.split(':');
      return NextResponse.json(
        {
          error: 'An application run is already active in a different mode.',
          code: 'RUN_MODE_CONFLICT',
          existingRunId,
          existingMode,
          requestedMode: creationOptions.deliveryMode,
        },
        { status: 409 }
      );
    }
    throw error;
  }
  if (RunRepository.events(run.id).length === 0) {
    RunRepository.appendEvent(
      run.id,
      'status',
      deliveryModeFor(run) === 'test_email'
        ? 'Synthetic application test started. No patient data will be used.'
        : 'Application preparation started.'
    );
  }

  after(async () => {
    await applicationRunWorker.start(run.id);
  });

  return NextResponse.json(
    {
      runId: run.id,
      state: run.state,
      deliveryMode: deliveryModeFor(run),
      workspaceUrl: `/applications/${application.id}/workspace`,
    },
    { status: 202 }
  );
}
