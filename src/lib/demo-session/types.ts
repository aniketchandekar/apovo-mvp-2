import { z } from 'zod';

export const demoBudgetSchema = z.object({
  chatTurns: z.number().int().min(0).max(10),
  workflows: z.number().int().min(0).max(1),
  retries: z.number().int().min(0).max(2),
  packets: z.number().int().min(0).max(1),
  emails: z.number().int().min(0).max(1),
});

export const demoSessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(8).max(128),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  sequence: z.number().int().min(0),
  remaining: demoBudgetSchema,
  workflowRunId: z.string().min(8).max(256).optional(),
});

export type DemoBudget = z.infer<typeof demoBudgetSchema>;
export type DemoSession = z.infer<typeof demoSessionSchema>;
export type DemoBudgetAction = 'chat' | 'workflow' | 'retry' | 'packet' | 'email';

export interface PublicDemoSessionSummary {
  active: boolean;
  expiresAt: string;
  secondsRemaining: number;
  remaining: DemoBudget;
  workflowBound: boolean;
}
