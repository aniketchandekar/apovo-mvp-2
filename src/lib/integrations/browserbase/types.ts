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
  download(url: string): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserAutomationSession {
  sessionId: string;
  connectUrl: string;
  liveViewUrl: string;
  browser: BrowserAutomationController;
  close(): Promise<void>;
}

