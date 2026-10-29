import { ApplicationRunError } from './errors';
import type { RequiredInput } from './types';

function invalid(message: string): never {
  throw new ApplicationRunError('INPUT_INVALID', message);
}

export function validateInputAnswer(input: RequiredInput, answer: unknown): string {
  if (input.input_type === 'file') {
    invalid('Upload the document as a PDF file instead.');
  }
  if (typeof answer !== 'string') invalid('A text answer is required.');
  const value = (answer as string).trim();

  switch (input.input_type) {
    case 'sensitive_text':
      if (!/^\d{4}$/.test(value)) invalid('Enter exactly the last 4 digits.');
      return value;
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
        invalid('Enter a valid date.');
      }
      return value;
    }
    case 'choice':
      if (!input.options?.includes(value)) invalid('Choose one of the provided options.');
      return value;
    case 'personal_note':
      if (!value) invalid('Write a short personal note before continuing.');
      if (value.length > 5000) invalid('Keep the personal note under 5,000 characters.');
      return value;
    case 'text':
    default:
      if (!value) {
        if (input.field_key === 'social_worker_details') return 'None';
        invalid('An answer is required.');
      }
      if (value.length > 2000) invalid('Keep the answer under 2,000 characters.');
      if (input.field_key === 'monthly_income' && !/^\$?\d[\d,]*(\.\d{1,2})?$/.test(value)) {
        invalid('Enter a monthly income amount, for example 1800 or $1,800.');
      }
      return value;
  }
}

export function publicInput(input: RequiredInput) {
  const { answer, ...rest } = input;
  return {
    ...rest,
    answer: input.input_type === 'sensitive_text' ? undefined : answer,
  };
}
