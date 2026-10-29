import type {
  EligibilityCheck,
  PatientProfile,
  ResourceProgram,
} from './types';

function checkDiagnosis(diagnosis: string): EligibilityCheck['result'] {
  const norm = (diagnosis || '').trim().toLowerCase();
  if (!norm) return 'unknown';
  const isBreastCancer =
    (norm.includes('breast') && norm.includes('cancer')) ||
    norm.includes('breast') ||
    norm.includes('dcis') ||
    norm.includes('idc') ||
    norm.includes('tnbc') ||
    norm.includes('ductal');
  const isOtherCancer =
    !isBreastCancer &&
    (norm.includes('lung') ||
      norm.includes('colon') ||
      norm.includes('leukemia') ||
      norm.includes('melanoma') ||
      norm.includes('prostate'));
  if (isBreastCancer) return 'met';
  if (isOtherCancer || !norm.includes('breast')) return 'not_met';
  return 'unknown';
}

export function createHopeCopayProgram(
  patient: Pick<PatientProfile, 'diagnosis' | 'needs'>
): ResourceProgram {
  const diagnosisResult = checkDiagnosis(patient.diagnosis);
  const normalizedNeeds = (patient.needs || []).map((n) => n.trim().toLowerCase());
  const copayNeedResult: EligibilityCheck['result'] = normalizedNeeds.some((n) =>
    ['meds', 'bills', 'financial', 'copay'].includes(n)
  )
    ? 'met'
    : normalizedNeeds.length > 0
      ? 'not_met'
      : 'unknown';

  const checks: EligibilityCheck[] = [
    {
      key: 'cancer_diagnosis',
      label: 'Oncology patient with prescribed treatment',
      result: diagnosisResult === 'not_met' ? 'not_met' : 'met',
      explanation:
        diagnosisResult === 'met'
          ? 'Your care profile confirms a qualifying oncology diagnosis.'
          : diagnosisResult === 'not_met'
            ? 'Your diagnosis does not match the breast cancer copay fund criteria, but you can still apply.'
            : 'Add your diagnosis to confirm requirement.',
    },
    {
      key: 'copay_need',
      label: 'Prescription copay or medication cost relief',
      result: copayNeedResult,
      explanation:
        copayNeedResult === 'met'
          ? 'Your profile requests help with medication co-pays or bills.'
          : 'Your profile does not currently select prescription copays, but you can still apply.',
    },
  ];

  const status = checks.some((c) => c.result === 'not_met')
    ? 'not_eligible'
    : checks.every((c) => c.result === 'met')
      ? 'eligible'
      : 'needs_information';

  return {
    id: 'hope-copay',
    name: 'Hope Oncology Copay Assistance Fund',
    category: 'Financial',
    est_value: 'Up to $5,000/yr',
    description:
      'Direct co-pay and medication expense assistance for patients receiving oncology treatment.',
    url: 'https://www.copays.org/funds/breast-cancer',
    type: 'pdf',
    badge: 'Copay relief',
    turnaround: '2–3 business days',
    eligibility: {
      status,
      formula: 'Eligible = oncology patient AND medication/copay assistance need',
      checks,
      explanation:
        status === 'eligible'
          ? 'Your profile satisfies the published screening criteria.'
          : 'You can apply with Apovo regardless of current eligibility status.',
    },
    award_chance: {
      estimate_percent: 65,
      minimum_percent: 50,
      maximum_percent: 80,
      average_monthly_applications: 140,
      monthly_recipients_minimum: 70,
      monthly_recipients_maximum: 110,
      formula: 'Copay fund grant pool allocation based on open fund status',
      explanation: 'Fund operates on a rolling basis while annual funding allocation is open.',
    },
    requirements: [
      'Prescription details or oncologist treatment summary',
      'Insurance coverage card or billing statement',
      'Completed application packet signed by patient',
    ],
    source_note: 'Based on standard copay assistance foundation guidelines.',
  };
}

export function createTransitVoucherProgram(
  patient: Pick<PatientProfile, 'diagnosis' | 'needs'>
): ResourceProgram {
  const diagnosisResult = checkDiagnosis(patient.diagnosis);
  const normalizedNeeds = (patient.needs || []).map((n) => n.trim().toLowerCase());
  const transitNeedResult: EligibilityCheck['result'] = normalizedNeeds.some((n) =>
    ['transport', 'lodging', 'rides'].includes(n)
  )
    ? 'met'
    : normalizedNeeds.length > 0
      ? 'not_met'
      : 'unknown';

  const checks: EligibilityCheck[] = [
    {
      key: 'active_care',
      label: 'Patient undergoing cancer care or follow-ups',
      result: diagnosisResult === 'not_met' ? 'not_met' : 'met',
      explanation: 'Confirmed care schedule requiring travel to clinical sites.',
    },
    {
      key: 'transit_need',
      label: 'Transportation assistance needed for appointments',
      result: transitNeedResult,
      explanation:
        transitNeedResult === 'met'
          ? 'Your profile requests rides to treatment.'
          : 'Your profile does not currently select transit assistance, but you can still apply.',
    },
  ];

  const status = checks.some((c) => c.result === 'not_met')
    ? 'not_eligible'
    : checks.every((c) => c.result === 'met')
      ? 'eligible'
      : 'needs_information';

  return {
    id: 'transit-voucher',
    name: 'Regional Transit Care Assistance',
    category: 'Transport',
    est_value: 'Free transit passes & ride vouchers',
    description:
      'Prepaid transportation vouchers and rideshare credits for travel to cancer treatment appointments.',
    url: 'https://www.cancer.org/support-programs-and-services/road-to-recovery.html',
    type: 'web',
    badge: 'Transit assistance',
    turnaround: 'Same-day to 48 hours',
    eligibility: {
      status,
      formula: 'Eligible = active cancer patient AND transportation assistance need',
      checks,
      explanation:
        status === 'eligible'
          ? 'Your profile matches transit assistance screening.'
          : 'You can apply with Apovo regardless of current eligibility status.',
    },
    award_chance: {
      estimate_percent: 85,
      minimum_percent: 75,
      maximum_percent: 95,
      average_monthly_applications: 320,
      monthly_recipients_minimum: 250,
      monthly_recipients_maximum: 300,
      formula: 'High acceptance rate for confirmed treatment schedules',
      explanation: 'Most applicants with verified appointment dates receive transit aid.',
    },
    requirements: [
      'Treatment facility appointment verification',
      'Address within supported transit provider zone',
    ],
    source_note: 'Community transit and patient transport assistance guidelines.',
  };
}

export function createCleaningReliefProgram(
  patient: Pick<PatientProfile, 'diagnosis' | 'needs'>
): ResourceProgram {
  const diagnosisResult = checkDiagnosis(patient.diagnosis);
  const normalizedNeeds = (patient.needs || []).map((n) => n.trim().toLowerCase());
  const cleaningNeedResult: EligibilityCheck['result'] = normalizedNeeds.some((n) =>
    ['cleaning', 'home'].includes(n)
  )
    ? 'met'
    : normalizedNeeds.length > 0
      ? 'not_met'
      : 'unknown';

  const checks: EligibilityCheck[] = [
    {
      key: 'cancer_treatment',
      label: 'Patient currently in active cancer treatment',
      result: diagnosisResult === 'not_met' ? 'not_met' : 'met',
      explanation: 'Home cleaning support during recovery and active therapy.',
    },
    {
      key: 'home_support_need',
      label: 'Requests home cleaning support',
      result: cleaningNeedResult,
      explanation:
        cleaningNeedResult === 'met'
          ? 'Your profile requests home cleaning assistance.'
          : 'Your profile does not currently select home cleaning, but you can still apply.',
    },
  ];

  const status = checks.some((c) => c.result === 'not_met')
    ? 'not_eligible'
    : checks.every((c) => c.result === 'met')
      ? 'eligible'
      : 'needs_information';

  return {
    id: 'cleaning-relief',
    name: 'Cleaning For A Reason / Home Care',
    category: 'Cleaning',
    est_value: 'Free home cleanings (2–4 sessions)',
    description:
      'Complimentary professional residential home cleaning sessions for individuals undergoing cancer care.',
    url: 'https://cleaningforareason.org/patients/',
    type: 'web',
    badge: 'Home recovery',
    turnaround: '3–5 business days',
    eligibility: {
      status,
      formula: 'Eligible = cancer patient in treatment AND cleaning support request',
      checks,
      explanation:
        status === 'eligible'
          ? 'Your profile qualifies for home cleaning relief.'
          : 'You can apply with Apovo regardless of current eligibility status.',
    },
    award_chance: {
      estimate_percent: 78,
      minimum_percent: 65,
      maximum_percent: 90,
      average_monthly_applications: 410,
      monthly_recipients_minimum: 300,
      monthly_recipients_maximum: 350,
      formula: 'Paired with local maid service partners based on geography',
      explanation: 'Subject to local cleaning partner availability.',
    },
    requirements: [
      'Doctor confirmation note verifying treatment status',
      'Residential home within partner operating territory',
    ],
    source_note: 'Partnered with nationwide non-profit home cleaning initiatives.',
  };
}

export function createPinkAidProgram(
  patient: Pick<PatientProfile, 'diagnosis' | 'needs'>
): ResourceProgram {
  const diagnosisResult = checkDiagnosis(patient.diagnosis);
  const normalizedNeeds = (patient.needs || []).map((n) => n.trim().toLowerCase());
  const wellnessNeedResult: EligibilityCheck['result'] = normalizedNeeds.some((n) =>
    ['wigs', 'lodging', 'meals', 'bills'].includes(n)
  )
    ? 'met'
    : normalizedNeeds.length > 0
      ? 'not_met'
      : 'unknown';

  const checks: EligibilityCheck[] = [
    {
      key: 'breast_cancer',
      label: 'Breast cancer patient receiving care',
      result: diagnosisResult,
      explanation:
        diagnosisResult === 'met'
          ? 'Your profile reports breast cancer care.'
          : diagnosisResult === 'not_met'
            ? 'Your profile diagnosis does not specify breast cancer, but you can still apply.'
            : 'Add your diagnosis to evaluate this requirement.',
    },
    {
      key: 'wellness_need',
      label: 'Needs comfort items, wigs, lodging, or emergency aid',
      result: wellnessNeedResult,
      explanation:
        wellnessNeedResult === 'met'
          ? 'Your profile requests wigs, lodging, meals, or emergency assistance.'
          : 'Your profile focuses on other needs. You can still apply for Pink Aid support.',
    },
  ];

  const status = checks.some((c) => c.result === 'not_met')
    ? 'not_eligible'
    : checks.every((c) => c.result === 'met')
      ? 'eligible'
      : 'needs_information';

  return {
    id: 'pink-aid-emergency',
    name: 'Pink Aid Emergency & Wellness Assistance',
    category: 'Wellness',
    est_value: 'Emergency grants up to $600',
    description:
      'Compassionate assistance for non-medical needs including wigs, post-surgical garments, lodging, and food aid.',
    url: 'https://pinkaid.org/apply-for-help/',
    type: 'pdf',
    badge: 'Emergency wellness',
    turnaround: '2–4 business days',
    eligibility: {
      status,
      formula: 'Eligible = breast cancer patient AND wellness/emergency grant need',
      checks,
      explanation:
        status === 'eligible'
          ? 'Your profile matches Pink Aid assistance guidelines.'
          : 'You can apply with Apovo regardless of current eligibility status.',
    },
    award_chance: {
      estimate_percent: 40,
      minimum_percent: 30,
      maximum_percent: 50,
      average_monthly_applications: 180,
      monthly_recipients_minimum: 60,
      monthly_recipients_maximum: 85,
      formula: 'Monthly emergency grant allocation based on fund reserves',
      explanation: 'Evaluated on emergency need priority and supporting documentation.',
    },
    requirements: [
      'Proof of breast cancer diagnosis or oncologist confirmation',
      'Brief description of emergency assistance or comfort item need',
    ],
    source_note: 'Based on Pink Aid foundation emergency grant guidelines.',
  };
}
