import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { ApovoStore } from '../../store';
import { getResourceCatalog } from '../../resource-catalog';

export const getActivePatientTool = new FunctionTool({
  name: 'get_active_patient_profile',
  description:
    'Retrieves the active breast cancer patient profile, including clinical diagnosis, stage, treatment status, and requested health-related social needs.',
  parameters: z.object({}),
  execute: async () => {
    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return { message: 'No active patient profile found.' };
    }
    return {
      id: patient.id,
      name: `${patient.first_name} ${patient.last_name || ''}`.trim(),
      diagnosis: patient.diagnosis,
      stage: patient.stage,
      treatmentStatus: patient.treatment_status,
      treatmentTypes: patient.treatment_types,
      needs: patient.needs,
      city: patient.address_city,
      state: patient.address_state,
      monthlyIncomeBand: patient.monthly_income_band,
      careEmail: patient.care_email,
    };
  },
});

export const getStartedGrantsTool = new FunctionTool({
  name: 'get_started_grants',
  description:
    'Retrieves the list of grant applications the active patient has already started with Apovo, along with their current phase and pending questions count.',
  parameters: z.object({}),
  execute: async () => {
    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return { startedGrants: [] };
    }
    const grants = ApovoStore.getStartedGrantsSummary(patient.id);
    return {
      count: grants.length,
      grants: grants.map((g) => ({
        grantName: g.application.resource.name,
        category: g.application.resource.category,
        estimatedValue: g.application.resource.est_value,
        phase: g.latestRun?.current_phase || 'unstarted',
        applicationState: g.application.state,
        totalQuestions: g.totalQuestionsCount,
        answeredQuestions: g.answeredQuestionsCount,
        pendingQuestions: g.pendingQuestionsCount,
      })),
    };
  },
});

export const getGrantCatalogTool = new FunctionTool({
  name: 'get_grant_catalog',
  description:
    'Retrieves the curated directory of assistance grants (e.g., Remember Betty, Hope Oncology, Transit Care, Cleaning For A Reason, Pink Aid) and their eligibility criteria.',
  parameters: z.object({
    category: z
      .string()
      .optional()
      .describe('Optional filter by category, such as Financial, Transport, Cleaning, or Wellness'),
  }),
  execute: async ({ category }: { category?: string }) => {
    const patient = ApovoStore.getActivePatient();
    let catalog = getResourceCatalog(patient);
    if (category) {
      const lower = category.toLowerCase();
      catalog = catalog.filter((r) => r.category.toLowerCase().includes(lower));
    }
    return {
      count: catalog.length,
      programs: catalog.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        estimatedValue: r.est_value,
        eligibilityStatus: r.eligibility.status,
        eligibilitySummary: r.eligibility.explanation,
        requirements: r.requirements,
        eligibilityChecks: r.eligibility.checks.map((c) => ({
          label: c.label,
          result: c.result,
          explanation: c.explanation,
        })),
      })),
    };
  },
});

export const getPendingQuestionsTool = new FunctionTool({
  name: 'get_pending_questions',
  description:
    'Retrieves the active patient\'s unanswered application questions and required document uploads across all started grants.',
  parameters: z.object({}),
  execute: async () => {
    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return { pendingQuestions: [] };
    }
    const grants = ApovoStore.getStartedGrantsSummary(patient.id);
    const questions: Array<{
      grantName: string;
      title: string;
      why: string;
      type: string;
      options?: string[];
    }> = [];

    for (const grant of grants) {
      for (const q of grant.pendingQuestions) {
        questions.push({
          grantName: grant.application.resource.name,
          title: q.title,
          why: q.why,
          type: q.type,
          options: q.options,
        });
      }
    }

    return {
      totalPending: questions.length,
      questions,
    };
  },
});

export const apovoConciergeTools = [
  getActivePatientTool,
  getStartedGrantsTool,
  getGrantCatalogTool,
  getPendingQuestionsTool,
];
