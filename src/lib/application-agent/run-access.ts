import { ApovoStore } from '../store';
import { openInputs } from '../pdf/field-map';
import { RunRepository } from './run-repository';

export function continueAfterPatientInput(runId: string): boolean {
  const run = RunRepository.get(runId);
  if (!run || run.current_phase !== 'waiting_for_patient') return false;
  if (openInputs(RunRepository.inputs(runId)).length > 0) return false;
  return Boolean(RunRepository.transition(runId, 'waiting_for_patient', 'filling_pdf'));
}

export function ownedRun(runId: string) {
  const patient = ApovoStore.getActivePatient();
  const run = RunRepository.get(runId);
  if (!patient || !run || run.patient_id !== patient.id) return null;
  return { patient, run };
}
