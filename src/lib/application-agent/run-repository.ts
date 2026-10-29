import { ApovoStore } from '../store';
import type {
  ApplicationArtifact,
  ApplicationRun,
  RequiredInput,
  RunEvent,
  RunEventKind,
  RunPhase,
  DeliveryMode,
} from './types';

const REMEMBER_BETTY_URL = 'https://www.rememberbetty.com/apply-for-assistance';

export const RunRepository = {
  createOrGet(
    applicationId: string,
    patientId: string,
    sourceUrl?: string,
    options: {
      deliveryMode?: DeliveryMode;
      testRecipient?: string;
      syntheticFixtureVersion?: string;
    } = {}
  ): ApplicationRun {
    const requestedMode = options.deliveryMode || 'prepare_only';
    const existing = ApovoStore.getActiveApplicationRun(applicationId, patientId);
    if (existing) {
      const existingMode = existing.delivery_mode || 'prepare_only';
      if (existingMode !== requestedMode) {
        throw new Error(`RUN_MODE_CONFLICT:${existing.id}:${existingMode}`);
      }
      return existing;
    }

    const now = new Date().toISOString();
    return ApovoStore.createApplicationRun({
      id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      application_id: applicationId,
      patient_id: patientId,
      state: 'active',
      current_phase: 'created',
      source_url: sourceUrl || REMEMBER_BETTY_URL,
      delivery_mode: requestedMode,
      test_recipient: options.testRecipient,
      synthetic_fixture_version: options.syntheticFixtureVersion,
      created_at: now,
      updated_at: now,
    });
  },

  get(id: string): ApplicationRun | null {
    return ApovoStore.getApplicationRun(id);
  },

  transition(
    id: string,
    expectedPhase: RunPhase,
    nextPhase: RunPhase,
    updates: Partial<ApplicationRun> = {}
  ): ApplicationRun | null {
    return ApovoStore.transitionApplicationRun(id, expectedPhase, nextPhase, updates);
  },

  update(id: string, updates: Partial<ApplicationRun>): ApplicationRun | null {
    return ApovoStore.updateApplicationRun(id, updates);
  },

  appendEvent(runId: string, kind: RunEventKind, publicMessage: string): RunEvent {
    return ApovoStore.addRunEvent({
      run_id: runId,
      kind,
      public_message: publicMessage,
    });
  },

  events(runId: string, after = 0): RunEvent[] {
    return ApovoStore.getRunEvents(runId, after);
  },

  saveInput(input: RequiredInput): RequiredInput {
    return ApovoStore.saveRequiredInput(input);
  },

  inputs(runId: string): RequiredInput[] {
    return ApovoStore.getRequiredInputs(runId);
  },

  answerInput(id: string, answer: unknown): RequiredInput | null {
    return ApovoStore.answerRequiredInput(id, answer);
  },

  saveArtifact(artifact: ApplicationArtifact): ApplicationArtifact {
    return ApovoStore.saveApplicationArtifact(artifact);
  },

  artifact(id: string): ApplicationArtifact | null {
    return ApovoStore.getApplicationArtifact(id);
  },
};
