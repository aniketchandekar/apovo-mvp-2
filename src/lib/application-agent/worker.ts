import { ApplicationRunError, toPublicRunError } from './errors';
import { isTerminalPhase } from './state-machine';
import type { ApplicationRun } from './types';
import type { PhaseHandlers } from './phases';
import { RunRepository } from './run-repository';

const PAUSED_PHASES = new Set([
  'waiting_for_patient',
  'awaiting_patient_review',
  'needs_manual_review',
  'test_email_delivery_uncertain',
]);

export class RunWorker {
  private readonly locks = new Map<string, Promise<ApplicationRun>>();

  constructor(
    private readonly handlers: PhaseHandlers = {},
    private readonly cleanup: (runId: string) => Promise<void> = async () => undefined
  ) {}

  isActive(runId: string): boolean {
    return this.locks.has(runId);
  }

  start(runId: string): Promise<ApplicationRun> {
    const active = this.locks.get(runId);
    if (active) return active;

    const promise = this.advance(runId).finally(() => {
      if (this.locks.get(runId) === promise) this.locks.delete(runId);
    });
    this.locks.set(runId, promise);
    return promise;
  }

  async stop(runId: string): Promise<ApplicationRun> {
    const run = RunRepository.get(runId);
    if (!run) throw new ApplicationRunError('RUN_NOT_FOUND', 'Application run not found.');
    if (isTerminalPhase(run.current_phase)) return run;

    const stopped = RunRepository.transition(run.id, run.current_phase, 'stopped');
    await this.cleanup(runId);
    return stopped || RunRepository.get(runId) || run;
  }

  private async advance(runId: string): Promise<ApplicationRun> {
    let run = RunRepository.get(runId);
    if (!run) throw new ApplicationRunError('RUN_NOT_FOUND', 'Application run not found.');

    for (let step = 0; step < 50; step += 1) {
      if (isTerminalPhase(run.current_phase) || PAUSED_PHASES.has(run.current_phase)) return run;

      const handler = this.handlers[run.current_phase];
      if (!handler) return run;

      try {
        const result = await handler(run);
        const transitioned = RunRepository.transition(
          run.id,
          run.current_phase,
          result.nextPhase,
          result.updates
        );
        if (!transitioned) {
          await this.cleanup(run.id);
          return RunRepository.get(run.id) || run;
        }
        run = transitioned;
        if (result.event) {
          RunRepository.appendEvent(run.id, result.event.kind, result.event.message);
        }
      } catch (error) {
        await this.cleanup(run.id);
        console.error(`Application run ${run.id} failed during ${run.current_phase}:`, error);
        const publicError = toPublicRunError(error);
        const failed = RunRepository.transition(run.id, run.current_phase, 'failed', {
          error_code: publicError.code,
          error_message: publicError.message,
        });
        RunRepository.appendEvent(run.id, 'error', publicError.message);
        return failed || RunRepository.get(run.id) || run;
      }
    }

    throw new ApplicationRunError(
      'INTERNAL_ERROR',
      'The application run exceeded its phase limit.'
    );
  }
}
