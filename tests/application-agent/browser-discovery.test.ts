import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';
import { BrowserDiscoveryCoordinator } from '../../src/lib/application-agent/phases/browser-discovery';
import type { ApplicationArtifact, ApplicationRun } from '../../src/lib/application-agent/types';
import type { BrowserAutomationSession } from '../../src/lib/integrations/browserbase/types';

function fixtureRun(): ApplicationRun {
  return {
    id: 'run_browser',
    application_id: 'remember_betty_assistance',
    patient_id: 'patient_test',
    state: 'active',
    current_phase: 'launching_browser',
    source_url: 'https://www.rememberbetty.com/apply-for-assistance',
    created_at: '2026-10-26T00:00:00.000Z',
    updated_at: '2026-10-26T00:00:00.000Z',
  };
}

function fixtureArtifact(run: ApplicationRun): ApplicationArtifact {
  return {
    id: 'artifact_source',
    run_id: run.id,
    patient_id: run.patient_id,
    kind: 'source_pdf',
    private_path: '/private/source.pdf',
    mime_type: 'application/pdf',
    sha256: 'abc',
    byte_size: 100,
    page_count: 3,
    created_at: run.created_at,
  };
}

function harness(options: { inspectError?: Error; downloadError?: Error } = {}) {
  let closeCalls = 0;
  let launches = 0;
  const updates: Array<Partial<ApplicationRun>> = [];
  const session = {
    sessionId: 'session_opaque',
    liveViewUrl: 'https://debug.browserbase.com/session',
    close: async () => {
      closeCalls += 1;
    },
  } as unknown as BrowserAutomationSession;
  const run = fixtureRun();
  const coordinator = new BrowserDiscoveryCoordinator({
    repository: {
      update(_id, update) {
        updates.push(update);
        return { ...run, ...update };
      },
    },
    async startSession() {
      launches += 1;
      return session;
    },
    async inspectSite() {
      if (options.inspectError) throw options.inspectError;
      return { applicationUrl: 'https://static1.squarespace.com/application.pdf', label: 'Application' };
    },
    async downloadPdf() {
      if (options.downloadError) throw options.downloadError;
      return fixtureArtifact(run);
    },
  });
  return { coordinator, run, updates, get closeCalls() { return closeCalls; }, get launches() { return launches; } };
}

test('keeps one session through discovery and closes it after the PDF', async () => {
  const subject = harness();
  const launched = await subject.coordinator.launch(subject.run);
  const inspected = await subject.coordinator.inspect({ ...subject.run, current_phase: 'inspecting_site' });
  const downloaded = await subject.coordinator.download({
    ...subject.run,
    current_phase: 'downloading_pdf',
    discovered_application_url: inspected.updates?.discovered_application_url,
  });

  assert.equal(launched.nextPhase, 'inspecting_site');
  assert.equal(inspected.nextPhase, 'downloading_pdf');
  assert.equal(downloaded.nextPhase, 'inspecting_pdf');
  assert.equal(downloaded.updates?.source_pdf_artifact_id, 'artifact_source');
  assert.equal(subject.launches, 1);
  assert.equal(subject.closeCalls, 1);
  assert.ok(subject.updates.some((update) => update.live_view_url === undefined));
});

test('closes the session and requests manual review for an invalid link', async () => {
  const subject = harness({
    inspectError: new ApplicationRunError('APPLICATION_LINK_REJECTED', 'The application link is not approved.'),
  });
  await subject.coordinator.launch(subject.run);
  const result = await subject.coordinator.inspect({ ...subject.run, current_phase: 'inspecting_site' });

  assert.equal(result.nextPhase, 'needs_manual_review');
  assert.equal(subject.closeCalls, 1);
});

test('closes the session when downloading fails unexpectedly', async () => {
  const subject = harness({ downloadError: new Error('provider detail') });
  await subject.coordinator.launch(subject.run);

  await assert.rejects(
    subject.coordinator.download({
      ...subject.run,
      current_phase: 'downloading_pdf',
      discovered_application_url: 'https://static1.squarespace.com/application.pdf',
    })
  );
  assert.equal(subject.closeCalls, 1);
});
