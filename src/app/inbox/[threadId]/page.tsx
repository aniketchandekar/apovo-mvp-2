'use client';

import React, { use, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';

interface InboxThreadPageProps {
  params: Promise<{ threadId: string }>;
}

function RedirectThread({ params }: InboxThreadPageProps) {
  const { threadId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/inbox?thread=${threadId}`);
  }, [router, threadId]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
      Opening conversation…
    </div>
  );
}

export default function InboxThreadPage({ params }: InboxThreadPageProps) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
          Opening conversation…
        </div>
      }
    >
      <RedirectThread params={params} />
    </Suspense>
  );
}
