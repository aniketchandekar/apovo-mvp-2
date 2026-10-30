import { z } from 'zod';

export const demoBudgetSchema = z.object({
  chatTurns: z.number().int().min(0).max(10),
  workflows: z.number().int().min(0).max(2),
  retries: z.number().int().min(0).max(2),
  packets: z.number().int().min(0).max(2),
  emails: z.number().int().min(0).max(1),
});

export const demoUiStateSchema = z.object({
  answeredTaskIds: z.array(z.string().max(80)).max(4),
  skippedTaskIds: z.array(z.string().max(80)).max(4),
  starredThreadIds: z.array(z.string().max(80)).max(4),
  readThreadIds: z.array(z.string().max(80)).max(4),
  unreadThreadIds: z.array(z.string().max(80)).max(4),
  sentThreadIds: z.array(z.string().max(80)).max(4),
  draft: z
    .object({
      threadId: z.string().max(80),
      to: z.string().max(160),
      subject: z.string().max(200),
      text: z.string().max(600),
    })
    .optional(),
});

export const demoSessionSchema = z.object({
  version: z.literal(2),
  sessionId: z.string().min(8).max(128),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  sequence: z.number().int().min(0),
  remaining: demoBudgetSchema,
  ui: demoUiStateSchema,
  workflowAttempt: z.number().int().min(0).max(2),
  workflowRunId: z.string().min(8).max(256).optional(),
});

export type DemoBudget = z.infer<typeof demoBudgetSchema>;
export type DemoUiState = z.infer<typeof demoUiStateSchema>;
export type DemoSession = z.infer<typeof demoSessionSchema>;
export type DemoBudgetAction = 'chat' | 'workflow' | 'retry' | 'packet' | 'email';

export interface PublicDemoSessionSummary {
  active: boolean;
  expiresAt: string;
  secondsRemaining: number;
  remaining: DemoBudget;
  workflowBound: boolean;
  canRestartWorkflow: boolean;
}
