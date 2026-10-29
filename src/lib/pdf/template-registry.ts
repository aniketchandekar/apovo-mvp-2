export interface RememberBettyTemplate {
  sha256: string;
  version: string;
  sourceFile: string;
  fields: Record<string, string>;
  multilineFields: string[];
  dropdownFields: Record<string, { options: string[] }>;
}

export const REMEMBER_BETTY_2024_09_09_SHA256 =
  '6a84b55e7151cb6361770defbd6575cb36291c1ffcd4f49ed1ab7637b9d58886';

const TEMPLATES: RememberBettyTemplate[] = [
  {
    sha256: REMEMBER_BETTY_2024_09_09_SHA256,
    version: 'remember-betty-application-2024-09-09',
    sourceFile: 'APPLICATION-FOR-ASSISTANCE-FORM-9-9-24.pdf',
    fields: {
      application_date: 'Text1',
      full_name: 'Text2',
      mailing_address: 'Text3',
      care_email: 'Text4',
      birth_date: 'Text5',
      ssn_last4: 'Text6',
      diagnosis_date: 'Text7',
      diagnosis_description: 'Text8',
      monthly_income: 'Text9',
      social_worker_details: 'Text10',
      actively_employed: 'Dropdown12.0',
      active_treatment: 'Dropdown12.1',
    },
    multilineFields: ['mailing_address', 'diagnosis_description', 'social_worker_details'],
    dropdownFields: {
      actively_employed: { options: ['Yes', 'No'] },
      active_treatment: { options: ['Yes', 'No'] },
    },
  },
];

export const PACKET_PAGE_LIMIT = 8;

export function getRememberBettyTemplate(sha256: string): RememberBettyTemplate | null {
  return TEMPLATES.find((template) => template.sha256 === sha256) || null;
}
