import type { ApplicationRun, RunEventKind, RunPhase } from '../types';

export interface PhaseResult {
  nextPhase: RunPhase;
  updates?: Partial<ApplicationRun>;
  event?: {
    kind: RunEventKind;
    message: string;
  };
}

export type PhaseHandler = (run: ApplicationRun) => Promise<PhaseResult>;
export type PhaseHandlers = Partial<Record<RunPhase, PhaseHandler>>;
