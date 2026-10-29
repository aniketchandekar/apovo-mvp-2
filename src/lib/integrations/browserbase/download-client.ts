import 'server-only';
import { getBrowserbaseConfiguration } from './config';
import type { SessionDownloadsClient } from './downloads';

const DOWNLOADS_API_BASE_URL = 'https://api.browserbase.com/v1/downloads';

export function createBrowserbaseDownloadsClient(): SessionDownloadsClient {
  const configuration = getBrowserbaseConfiguration();
  const headers = { 'x-bb-api-key': configuration.apiKey };

  return {
    list: (sessionId) => {
      const params = new URLSearchParams({ sessionId, mimeType: 'application/pdf' });
      return fetch(`${DOWNLOADS_API_BASE_URL}?${params}`, { headers, cache: 'no-store' });
    },
    get: (downloadId) =>
      fetch(`${DOWNLOADS_API_BASE_URL}/${encodeURIComponent(downloadId)}`, {
        headers: { ...headers, Accept: 'application/octet-stream' },
        cache: 'no-store',
      }),
  };
}
