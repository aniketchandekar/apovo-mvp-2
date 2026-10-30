import { NextRequest, NextResponse } from 'next/server';

const SAFE_READ_ROUTES = new Set([
  '/api/dashboard',
  '/api/capabilities',
  '/api/chat',
  '/api/tasks',
  '/api/inbox',
]);

const DEMO_TASK_ACTION =
  /^\/api\/tasks\/demo_task_remember_betty_followup\/(answer|skip)$/;
const DEMO_INBOX_THREAD =
  /^\/api\/inbox\/(demo_thread_remember_betty|demo_thread_care_welcome)$/;

export function proxy(request: NextRequest) {
  if (process.env.APOVO_DEPLOYMENT_MODE !== 'vercel_demo') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isDemoApi = pathname === '/api/demo' || pathname.startsWith('/api/demo/');
  const isSafeRead = request.method === 'GET' && SAFE_READ_ROUTES.has(pathname);
  const isDemoTaskAction = request.method === 'POST' && DEMO_TASK_ACTION.test(pathname);
  const isDemoInboxListAction = request.method === 'POST' && pathname === '/api/inbox';
  const isDemoInboxThread =
    (request.method === 'GET' || request.method === 'POST') &&
    DEMO_INBOX_THREAD.test(pathname);
  if (
    isDemoApi ||
    isSafeRead ||
    isDemoTaskAction ||
    isDemoInboxListAction ||
    isDemoInboxThread
  ) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'Not found.' },
    {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

export const config = {
  matcher: ['/api/:path*'],
};
