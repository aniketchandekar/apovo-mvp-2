import type { ZodType } from 'zod/v4';

export interface BrowserAutomationPage {
  goto(url: string): Promise<unknown>;
  evaluate<R = unknown, Arg = unknown>(
    expression: string | ((arg: Arg) => R | Promise<R>),
    arg?: Arg
  ): Promise<R>;
}

export interface BrowserAutomationContext {
  pages(): Promise<BrowserAutomationPage[]>;
  newPage(): Promise<BrowserAutomationPage>;
}

export interface BrowserAutomationController {
  context: BrowserAutomationContext;
  close(): Promise<void>;
}

export interface StagehandAutomationController {
  extract<T>(
    instruction: string,
    schema: ZodType<T>,
    options: { page: BrowserAutomationPage; timeout?: number }
  ): Promise<{ data: T }>;
  close(): Promise<void>;
}

export interface BrowserAutomationSession {
  sessionId: string;
  connectUrl: string;
  liveViewUrl: string;
  browser: BrowserAutomationController;
  stagehand: StagehandAutomationController;
  close(): Promise<void>;
}

