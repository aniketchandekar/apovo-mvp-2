import React, { Suspense } from 'react';
import { CareInboxView } from '@/components/inbox/CareInboxView';

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink-muted)' }}>
          Opening Care Email…
        </div>
      }
    >
      <CareInboxView />
    </Suspense>
  );
}
