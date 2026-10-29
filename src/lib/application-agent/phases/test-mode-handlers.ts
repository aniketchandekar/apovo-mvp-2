import { PDFDocument } from 'pdf-lib';
import { localArtifactStore } from '../../artifacts/local-artifact-store';
import { ApovoStore } from '../../store';
import { assemblePacket } from '../../pdf/assemble-packet';
import {
  buildRememberBettySyntheticSupportingDocuments,
  fillRememberBettySyntheticApplication,
} from '../../pdf/build-remember-betty-test-packet';
import {
  deliverRememberBettySyntheticPacket,
  type ApplicationTestDeliveryResult,
} from '../../integrations/agentmail/application-test-delivery';
import { ApplicationRunError } from '../errors';
import { assertApprovedTestRun, REMEMBER_BETTY_TEST_RECIPIENT } from '../test-mode-policy';
import { RunRepository } from '../run-repository';
import type { ApplicationArtifact, ApplicationRun } from '../types';
import type { PhaseHandlers } from './index';

type Deliver = typeof deliverRememberBettySyntheticPacket;

function artifact(run: ApplicationRun, id: string | undefined): ApplicationArtifact {
  const found = id ? RunRepository.artifact(id) : null;
  if (!found) {
    throw new ApplicationRunError('ARTIFACT_NOT_FOUND', 'A synthetic test document is missing.');
  }
  return found;
}

function read(run: ApplicationRun, id: string | undefined): Uint8Array {
  return localArtifactStore.readPdf(artifact(run, id), {
    runId: run.id,
    patientId: run.patient_id,
  });
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

export function createTestModePhaseHandlers(
  dependencies: { deliver?: Deliver; inboxId?: () => string } = {}
): PhaseHandlers {
  const deliver = dependencies.deliver || deliverRememberBettySyntheticPacket;
  const inboxId = dependencies.inboxId || (() => process.env.AGENTMAIL_INBOX_ID?.trim() || '');

  return {
    loading_synthetic_test_data: async (run) => {
      assertApprovedTestRun(run);
      artifact(run, run.source_pdf_artifact_id);
      return {
        nextPhase: 'filling_test_pdf',
        event: { kind: 'status', message: 'Loaded the versioned fake applicant. No patient data is being used.' },
      };
    },

    filling_test_pdf: async (run) => {
      assertApprovedTestRun(run);
      const filled = await fillRememberBettySyntheticApplication(
        read(run, run.source_pdf_artifact_id)
      );
      const saved = localArtifactStore.savePdf({
        runId: run.id,
        patientId: run.patient_id,
        kind: 'draft_pdf',
        bytes: filled.bytes,
        pageCount: filled.pageCount,
      });
      RunRepository.saveArtifact(saved);
      return {
        nextPhase: 'generating_test_documents',
        updates: { draft_pdf_artifact_id: saved.id },
        event: { kind: 'action', message: 'Filled the application with synthetic test values.' },
      };
    },

    generating_test_documents: async (run) => {
      assertApprovedTestRun(run);
      const documents = await buildRememberBettySyntheticSupportingDocuments();
      const diagnosis = localArtifactStore.savePdf({
        runId: run.id,
        patientId: run.patient_id,
        kind: 'diagnosis_letter',
        bytes: documents.diagnosisLetter,
        pageCount: await pageCount(documents.diagnosisLetter),
      });
      const note = localArtifactStore.savePdf({
        runId: run.id,
        patientId: run.patient_id,
        kind: 'personal_note',
        bytes: documents.personalNote,
        pageCount: await pageCount(documents.personalNote),
      });
      RunRepository.saveArtifact(diagnosis);
      RunRepository.saveArtifact(note);
      return {
        nextPhase: 'assembling_test_packet',
        updates: {
          test_diagnosis_artifact_id: diagnosis.id,
          test_personal_note_artifact_id: note.id,
        },
        event: { kind: 'action', message: 'Generated synthetic diagnosis and personal-note documents.' },
      };
    },

    assembling_test_packet: async (run) => {
      assertApprovedTestRun(run);
      const packet = await assemblePacket([
        read(run, run.draft_pdf_artifact_id),
        read(run, run.test_diagnosis_artifact_id),
        read(run, run.test_personal_note_artifact_id),
      ]);
      const saved = localArtifactStore.savePdf({
        runId: run.id,
        patientId: run.patient_id,
        kind: 'synthetic_test_packet',
        bytes: packet.bytes,
        pageCount: packet.pageCount,
      });
      RunRepository.saveArtifact(saved);
      return {
        nextPhase: 'sending_test_email',
        updates: { test_packet_artifact_id: saved.id },
        event: { kind: 'status', message: `Assembled a ${packet.pageCount}-page test-only packet. Sending it only to Nicole.` },
      };
    },

    sending_test_email: async (run) => {
      assertApprovedTestRun(run);
      const packet = read(run, run.test_packet_artifact_id);
      let result: ApplicationTestDeliveryResult;
      try {
        result = await deliver(
          { run, inboxId: inboxId(), packetBytes: packet },
          {
            persistDraft: (draftId) => {
              RunRepository.update(run.id, { agentmail_draft_id: draftId });
            },
            persistAttempt: (attemptedAt) => {
              RunRepository.update(run.id, { delivery_attempted_at: attemptedAt });
            },
            persistSuccess: (sent, sentAt) => {
              RunRepository.update(run.id, {
                agentmail_message_id: sent.messageId,
                agentmail_thread_id: sent.threadId,
                test_email_sent_at: sentAt,
              });
            },
          }
        );
      } catch (error) {
        if (error instanceof ApplicationRunError && error.code === 'TEST_DELIVERY_UNCERTAIN') {
          return {
            nextPhase: 'test_email_delivery_uncertain',
            updates: { error_code: error.code, error_message: error.message },
            event: { kind: 'warning', message: error.message },
          };
        }
        throw error;
      }

      ApovoStore.saveEmail({
        patient_id: run.patient_id,
        application_id: run.application_id,
        program_name: 'Remember Betty Synthetic Test',
        inbox_id: inboxId(),
        thread_id: result.threadId,
        message_id: result.messageId,
        direction: 'outbound',
        from: inboxId(),
        to: REMEMBER_BETTY_TEST_RECIPIENT,
        subject: '[APOVO TEST] Remember Betty synthetic application packet — Ava Testperson',
        body_text: 'Synthetic application test packet sent only to Nicole. No patient data was used.',
        classification: 'unrelated',
        summary: `Synthetic Remember Betty test delivery for run ${run.id}`,
        labels: ['apovo_application_test', 'remember_betty_test'],
        delivery_status: 'sent',
        unread: false,
      });
      return {
        nextPhase: 'test_email_sent',
        updates: {
          agentmail_draft_id: result.draftId,
          agentmail_message_id: result.messageId,
          agentmail_thread_id: result.threadId,
          test_email_sent_at: result.sentAt,
        },
        event: { kind: 'complete', message: 'Test email sent only to Nicole. Nothing was submitted to Remember Betty.' },
      };
    },
  };
}

export const testModePhaseHandlers = createTestModePhaseHandlers();
