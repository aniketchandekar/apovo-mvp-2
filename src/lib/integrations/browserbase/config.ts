import { ApplicationRunError } from '../../application-agent/errors';

export interface BrowserbaseConfiguration {
  apiKey: string;
  projectId: string;
  region: 'us-east-1';
}

export function getBrowserbaseConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env
): BrowserbaseConfiguration {
  const apiKey = environment.BROWSERBASE_API_KEY?.trim();
  const projectId = environment.BROWSERBASE_PROJECT_ID?.trim();

  if (!apiKey || !projectId) {
    throw new ApplicationRunError(
      'CONFIGURATION_MISSING',
      'Browserbase is not configured for application preparation.'
    );
  }

  return { apiKey, projectId, region: 'us-east-1' };
}
