export const DEMO_SESSION_DURATION_SECONDS = 15 * 60;

type DemoEnvironment = Record<string, string | undefined>;

export class DemoSessionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoSessionConfigurationError';
  }
}

export function isVercelDemoMode(environment: DemoEnvironment = process.env): boolean {
  return environment.APOVO_DEPLOYMENT_MODE === 'vercel_demo';
}

export function getDemoSessionConfiguration(environment: DemoEnvironment = process.env) {
  const signingSecret = environment.APOVO_DEMO_SESSION_SECRET?.trim() || '';
  if (signingSecret.length < 32) {
    throw new DemoSessionConfigurationError(
      'The demo session signing secret must contain at least 32 characters.'
    );
  }

  return {
    signingSecret,
    sessionDurationSeconds: DEMO_SESSION_DURATION_SECONDS,
  } as const;
}
