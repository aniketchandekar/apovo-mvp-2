import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { EmailClassification } from '@/lib/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    await params;
    const body = await req.json().catch(() => ({}));
    const { emailId, classification } = body as { emailId?: string; classification?: EmailClassification };

    if (!emailId || !classification) {
      return NextResponse.json(
        { error: 'emailId and classification are required' },
        { status: 400 }
      );
    }

    const validClassifications: EmailClassification[] = [
      'confirmation',
      'needs_info',
      'pending',
      'approved',
      'denied',
      'benefit_delivered',
      'unrelated',
    ];

    if (!validClassifications.includes(classification)) {
      return NextResponse.json(
        { error: `Invalid classification. Must be one of: ${validClassifications.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = ApovoStore.reclassifyEmail(emailId, classification);
    if (!updated) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, email: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reclassify email';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
