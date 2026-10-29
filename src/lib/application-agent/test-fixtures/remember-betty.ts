export const REMEMBER_BETTY_SYNTHETIC_FIXTURE_VERSION = 'remember-betty-synthetic-v1' as const;

export const REMEMBER_BETTY_SYNTHETIC_APPLICANT = Object.freeze({
  version: REMEMBER_BETTY_SYNTHETIC_FIXTURE_VERSION,
  values: Object.freeze({
    application_date: '10/28/2026',
    full_name: 'Ava Testperson',
    mailing_address: '100 Test Only Way\nAustin, TX 78701',
    care_email: 'ava.test@apovo.example',
    birth_date: '01/15/1985',
    ssn_last4: '0000',
    diagnosis_date: '01/01/2024',
    diagnosis_description: 'Synthetic breast cancer test case, Stage II',
    monthly_income: '$1,500 (synthetic)',
    social_worker_details: 'Jordan Sample, Example Test Clinic',
    actively_employed: 'No',
    active_treatment: 'Yes',
  }),
  diagnosisLetter: Object.freeze({
    clinician: 'Dr. Casey Example',
    facility: 'Example Test Oncology Center',
    body:
      'This synthetic document confirms that Ava Testperson is a fictional test applicant with a fictional breast cancer diagnosis. It contains no real patient information and is not medical documentation.',
  }),
  personalNote:
    'This is a fictional personal statement created only to test Apovo packet assembly and email delivery. No person, diagnosis, financial situation, or life event described in this packet is real.',
});
