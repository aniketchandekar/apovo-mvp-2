import { ApovoStore } from '../../store';
import { localArtifactStore } from '../../artifacts/local-artifact-store';
import { assemblePacket } from '../../pdf/assemble-packet';
import {
  answeredFormValues,
  knownProfileValues,
  openInputs,
  REQUIRED_INPUT_SPECS,
} from '../../pdf/field-map';
import { fillRememberBettyApplication } from '../../pdf/fill-application';
import { inspectPdf, requireReviewedTemplate } from '../../pdf/inspect-pdf';
import { renderPersonalNote } from '../../pdf/render-personal-note';
import type { PatientProfile } from '../../types';
import { ApplicationRunError } from '../errors';
import { RunRepository } from '../run-repository';
import type { ApplicationArtifact, ApplicationRun } from '../types';
import type { PhaseHandlers } from './index';
import { deliveryModeFor } from '../test-mode-policy';

function patientFor(run: ApplicationRun): PatientProfile {
  const patient = ApovoStore.getPatient(run.patient_id);
  if (!patient) {
    throw new ApplicationRunError('APPLICATION_NOT_FOUND', 'The patient profile is unavailable.');
  }
  return patient;
}

function artifactFor(run: ApplicationRun, artifactId: string | undefined): ApplicationArtifact {
  const artifact = artifactId ? RunRepository.artifact(artifactId) : null;
  if (!artifact) {
    throw new ApplicationRunError('ARTIFACT_NOT_FOUND', 'A required application document is missing.');
  }
  return artifact;
}

function readArtifactBytes(run: ApplicationRun, artifact: ApplicationArtifact): Uint8Array {
  return localArtifactStore.readPdf(artifact, { runId: run.id, patientId: run.patient_id });
}

export const pdfPhaseHandlers: PhaseHandlers = {
  inspecting_pdf: async (run) => {
    try {
      const bytes = readArtifactBytes(run, artifactFor(run, run.source_pdf_artifact_id));
      const inspection = await inspectPdf(bytes);
      requireReviewedTemplate(inspection);
      return {
        nextPhase:
          deliveryModeFor(run) === 'test_email'
            ? 'loading_synthetic_test_data'
            : 'provisioning_care_email',
        event: {
          kind: 'status',
          message:
            deliveryModeFor(run) === 'test_email'
              ? `The ${inspection.pageCount}-page application is recognized. Loading the synthetic test fixture.`
              : `The ${inspection.pageCount}-page application form is recognized and fillable.`,
        },
      };
    } catch (error) {
      if (
        error instanceof ApplicationRunError &&
        (error.code === 'PDF_VERSION_UNKNOWN' || error.code === 'PDF_INVALID')
      ) {
        return {
          nextPhase: 'needs_manual_review',
          event: { kind: 'warning', message: error.message },
        };
      }
      throw error;
    }
  },

  provisioning_care_email: async (run) => {
    const patient = patientFor(run);
    if (patient.care_email && patient.agentmail_inbox_id === patient.care_email) {
      return {
        nextPhase: 'mapping_fields',
        event: { kind: 'status', message: 'Your dedicated care email is confirmed.' },
      };
    }

    const { provisionPatientInbox } = await import('../../integrations/agentmail/care-inbox');
    const inbox = await provisionPatientInbox(patient);

    ApovoStore.assignCareInbox(patient.id, inbox.email, inbox.inboxId);
    return {
      nextPhase: 'mapping_fields',
      event: { kind: 'action', message: 'Created and confirmed your dedicated care email address.' },
    };
  },

  mapping_fields: async (run) => {
    patientFor(run);
    for (const spec of REQUIRED_INPUT_SPECS) {
      RunRepository.saveInput({
        id: `input_${run.id}_${spec.field_key}`,
        run_id: run.id,
        patient_id: run.patient_id,
        field_key: spec.field_key,
        input_type: spec.input_type,
        prompt: spec.prompt,
        reason: spec.reason,
        options: spec.options,
        status: 'open',
        created_at: new Date().toISOString(),
      });
    }

    const open = openInputs(RunRepository.inputs(run.id));
    if (open.length > 0) {
      return {
        nextPhase: 'waiting_for_patient',
        event: {
          kind: 'question',
          message: `I need ${open.length} item${open.length === 1 ? '' : 's'} from you to complete the application.`,
        },
      };
    }

    return {
      nextPhase: 'filling_pdf',
      event: { kind: 'status', message: 'All required details are available.' },
    };
  },

  filling_pdf: async (run) => {
    const patient = patientFor(run);
    const inputs = RunRepository.inputs(run.id);
    const open = openInputs(inputs);
    if (open.length > 0) {
      return {
        nextPhase: 'waiting_for_patient',
        event: {
          kind: 'question',
          message: `${open.length} answer${open.length === 1 ? ' is' : 's are'} still needed before filling the form.`,
        },
      };
    }

    const sourceBytes = readArtifactBytes(run, artifactFor(run, run.source_pdf_artifact_id));
    const template = requireReviewedTemplate(await inspectPdf(sourceBytes));
    const values = { ...knownProfileValues(patient), ...answeredFormValues(inputs) };
    const filled = await fillRememberBettyApplication(sourceBytes, template, values);
    const draft = localArtifactStore.savePdf({
      runId: run.id,
      patientId: run.patient_id,
      kind: 'draft_pdf',
      bytes: filled.bytes,
      pageCount: filled.pageCount,
    });
    RunRepository.saveArtifact(draft);

    return {
      nextPhase: 'assembling_packet',
      updates: { draft_pdf_artifact_id: draft.id },
      event: { kind: 'action', message: 'Filled the application form with your information.' },
    };
  },

  assembling_packet: async (run) => {
    const inputs = RunRepository.inputs(run.id);
    const letterAnswer = inputs.find(
      (input) => input.field_key === 'diagnosis_letter' && input.status === 'answered'
    )?.answer as { artifactId?: string } | undefined;
    const note = inputs.find(
      (input) => input.field_key === 'personal_note' && input.status === 'answered'
    )?.answer;

    if (!letterAnswer?.artifactId || typeof note !== 'string' || !note.trim()) {
      return {
        nextPhase: 'waiting_for_patient',
        event: { kind: 'question', message: 'The diagnosis letter and personal note are still needed.' },
      };
    }

    const draftBytes = readArtifactBytes(run, artifactFor(run, run.draft_pdf_artifact_id));
    const letterBytes = readArtifactBytes(run, artifactFor(run, letterAnswer.artifactId));
    const noteBytes = await renderPersonalNote(note);
    const packet = await assemblePacket([draftBytes, letterBytes, noteBytes]);
    const artifact = localArtifactStore.savePdf({
      runId: run.id,
      patientId: run.patient_id,
      kind: 'unsigned_packet',
      bytes: packet.bytes,
      pageCount: packet.pageCount,
    });
    RunRepository.saveArtifact(artifact);

    return {
      nextPhase: 'awaiting_patient_review',
      updates: { unsigned_packet_artifact_id: artifact.id },
      event: {
        kind: 'complete',
        message: `Your ${packet.pageCount}-page packet is ready to review. Nothing has been sent or submitted.`,
      },
    };
  },
};
