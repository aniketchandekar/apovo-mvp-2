import { connection, NextResponse } from 'next/server';

export async function GET() {
  await connection();
  return NextResponse.json({
    applicationTestMode:
      process.env.APOVO_DEPLOYMENT_MODE === 'vercel_demo' ||
      process.env.APOVO_APPLICATION_TEST_MODE === '1',
  });
}
