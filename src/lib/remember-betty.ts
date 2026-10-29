import {
  AwardChanceEstimate,
  EligibilityAssessment,
  EligibilityCheck,
  PatientProfile,
  ResourceProgram,
} from './types';

const FINANCIAL_NEED_KEYS = new Set([
  'bills',
  'rent',
  'mortgage',
  'utilities',
  'groceries',
  'meals',
  'food',
  'financial',
]);

export const REMEMBER_BETTY_AWARD_CHANCE: AwardChanceEstimate = {
  estimate_percent: 2.4,
  minimum_percent: 2,
  maximum_percent: 2.8,
  average_monthly_applications: 250,
  monthly_recipients_minimum: 5,
  monthly_recipients_maximum: 7,
  formula: '6 ÷ 250 × 100 = 2.4% (range: 5–7 ÷ 250 = 2.0–2.8%)',
  explanation:
    'This is the foundation’s published monthly base rate, not a personalized prediction. It assumes an eligible, complete application received during the submission window.',
};

export function assessRememberBettyEligibility(
  patient: Pick<PatientProfile, 'diagnosis' | 'needs'>
): EligibilityAssessment {
  const diagnosis = patient.diagnosis.trim().toLowerCase();
  const isBreastCancer =
    (diagnosis.includes('breast') && diagnosis.includes('cancer')) ||
    diagnosis.includes('breast') ||
    diagnosis.includes('dcis') ||
    diagnosis.includes('idc') ||
    diagnosis.includes('tnbc') ||
    diagnosis.includes('ductal');
  const isOtherCancer =
    !isBreastCancer &&
    (diagnosis.includes('lung') ||
      diagnosis.includes('colon') ||
      diagnosis.includes('leukemia') ||
      diagnosis.includes('melanoma') ||
      diagnosis.includes('prostate'));

  const breastCancerResult: EligibilityCheck['result'] = !diagnosis
    ? 'unknown'
    : isBreastCancer
      ? 'met'
      : isOtherCancer || !diagnosis.includes('breast')
        ? 'not_met'
        : 'unknown';

  const normalizedNeeds = patient.needs.map((need) => need.trim().toLowerCase());
  const financialNeedResult: EligibilityCheck['result'] = normalizedNeeds.some((need) =>
    FINANCIAL_NEED_KEYS.has(need)
  )
    ? 'met'
    : 'unknown';

  const checks: EligibilityCheck[] = [
    {
      key: 'breast_cancer',
      label: 'Breast cancer patient or survivor',
      result: breastCancerResult,
      explanation:
        breastCancerResult === 'met'
          ? 'Your care profile reports a breast cancer diagnosis.'
          : breastCancerResult === 'not_met'
            ? 'Your current diagnosis does not identify breast cancer. You can still apply.'
            : 'Add your diagnosis to evaluate this requirement.',
    },
    {
      key: 'financial_need',
      label: 'Requests help with living expenses',
      result: financialNeedResult,
      explanation:
        financialNeedResult === 'met'
          ? 'Your profile requests help with bills, housing, utilities, food, or groceries.'
          : 'Your profile focuses on other support needs. You can still apply for this living-expense grant.',
    },
  ];

  const status: EligibilityAssessment['status'] = checks.some(
    (check) => check.result === 'not_met'
  )
    ? 'not_eligible'
    : checks.every((check) => check.result === 'met')
      ? 'eligible'
      : 'needs_information';

  return {
    status,
    formula: 'Eligible = breast cancer patient/survivor AND financial-assistance need',
    checks,
    explanation:
      status === 'eligible'
        ? 'Your profile satisfies the two published screening conditions used here.'
        : status === 'not_eligible'
          ? 'Your profile does not satisfy the published diagnosis condition, but you can still apply with Apovo.'
          : 'Some screening criteria are unconfirmed, but you can still apply with Apovo.',
  };
}

export function createRememberBettyProgram(
  patient: Pick<PatientProfile, 'diagnosis' | 'needs'>
): ResourceProgram {
  return {
    id: 'remember-betty',
    name: 'Remember Betty Foundation',
    category: 'Financial',
    est_value: 'Financial assistance',
    description:
      'Financial assistance for breast cancer patients and survivors facing everyday living expenses.',
    url: 'https://www.rememberbetty.com/apply-for-assistance',
    type: 'pdf',
    badge: 'Official application',
    turnaround: 'Applications accepted on days 1–7 of each month',
    eligibility: assessRememberBettyEligibility(patient),
    award_chance: REMEMBER_BETTY_AWARD_CHANCE,
    requirements: [
      'Submit only from the 1st through the 7th of the month',
      'Include the completed application, diagnosis letter, and personal note',
      'The applicant must sign the application',
      'Keep the complete fax or mailed packet to 8 pages or fewer',
      'Send by fax or postal mail; email applications are not accepted',
    ],
    source_note:
      'Based on the current application instructions published by the Remember Betty Foundation.',
  };
}
