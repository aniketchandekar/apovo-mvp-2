import { NextRequest, NextResponse } from 'next/server';

const SAFE_READ_ROUTES = new Set(['/api/dashboard', '/api/capabilities', '/api/chat']);

export function proxy(request: NextRequest) {
  if (process.env.APOVO_DEPLOYMENT_MODE !== 'vercel_demo') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isDemoApi = pathname === '/api/demo' || pathname.startsWith('/api/demo/');
  const isSafeRead = request.method === 'GET' && SAFE_READ_ROUTES.has(pathname);
  if (isDemoApi || isSafeRead) return NextResponse.next();

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
