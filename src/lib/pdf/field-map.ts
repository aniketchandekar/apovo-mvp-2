import type { PatientProfile } from '../types';
import type { RequiredInput, RequiredInputType } from '../application-agent/types';

export interface RequiredInputSpec {
  field_key: string;
  input_type: RequiredInputType;
  prompt: string;
  reason: string;
  options?: string[];
}

export const REQUIRED_INPUT_SPECS: RequiredInputSpec[] = [
  {
    field_key: 'ssn_last4',
    input_type: 'sensitive_text',
    prompt: 'What are the last 4 digits of your SSN?',
    reason: 'The application asks for the last 4 digits only. This answer is never shown in the activity log.',
  },
  {
    field_key: 'monthly_income',
    input_type: 'text',
    prompt: 'What is your current average household monthly income?',
    reason: 'The foundation needs a current monthly dollar amount.',
  },
  {
    field_key: 'actively_employed',
    input_type: 'choice',
    options: ['Yes', 'No'],
    prompt: 'Are you currently actively employed?',
    reason: 'Your current employment status must be confirmed for this application.',
  },
  {
    field_key: 'active_treatment',
    input_type: 'choice',
    options: ['Yes', 'No'],
    prompt: 'Are you currently in active treatment?',
    reason: 'You do not need to be in active treatment to apply, but the form requires a current answer.',
  },
  {
    field_key: 'diagnosis_date',
    input_type: 'date',
    prompt: 'What was your date of diagnosis?',
    reason: 'The application requires your diagnosis date.',
  },
  {
    field_key: 'social_worker_details',
    input_type: 'text',
    prompt:
      'If a social worker or patient navigator is helping with this application, enter their name and facility or hospital. Otherwise, answer “None”.',
    reason: 'This tells the foundation who assisted you, if anyone.',
  },
  {
    field_key: 'diagnosis_letter',
    input_type: 'file',
    prompt:
      'Upload a letter from your oncologist, surgeon, patient navigator, or social worker confirming your breast cancer diagnosis (PDF).',
    reason: 'This supporting letter is required. Pathology reports and appointment notices are not accepted.',
  },
  {
    field_key: 'personal_note',
    input_type: 'personal_note',
    prompt: 'Write a short personal note about how breast cancer has affected your life.',
    reason: 'A personal statement must be included with the application.',
  },
];

export const DOCUMENT_INPUT_KEYS = ['diagnosis_letter', 'personal_note'];

export function formatApplicationDate(date = new Date()): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

export function knownProfileValues(
  patient: PatientProfile,
  options: { applicationDate?: string } = {}
): Record<string, string> {
  const values: Record<string, string> = {
    application_date: options.applicationDate || formatApplicationDate(),
  };

  const fullName = `${patient.first_name} ${patient.last_name}`.trim();
  if (fullName) values.full_name = fullName;

  const street = patient.address_street.trim();
  const cityLine = [patient.address_city, patient.address_state, patient.address_zip]
    .map((part) => part.trim())
    .filter(Boolean);
  if (street && cityLine.length === 3) {
    values.mailing_address = `${street}\n${patient.address_city.trim()}, ${patient.address_state.trim()} ${patient.address_zip.trim()}`;
  }

  if (patient.dob) values.birth_date = patient.dob;

  const diagnosis = [patient.diagnosis, patient.stage]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  if (diagnosis) values.diagnosis_description = diagnosis;

  if (patient.care_email && patient.agentmail_inbox_id) {
    values.care_email = patient.care_email;
  }

  return values;
}

export function answeredFormValues(inputs: RequiredInput[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const input of inputs) {
    if (input.status !== 'answered' || DOCUMENT_INPUT_KEYS.includes(input.field_key)) continue;
    if (typeof input.answer === 'string' && input.answer.trim()) {
      values[input.field_key] = input.answer.trim();
    }
  }
  return values;
}

export function openInputs(inputs: RequiredInput[]): RequiredInput[] {
  return inputs.filter((input) => input.status === 'open');
}
