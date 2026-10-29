import React, { Suspense } from 'react';
import { PendingItemsView } from '@/components/tasks/PendingItemsView';

export default function TasksPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink-muted)' }}>
          Opening Pending items…
        </div>
      }
    >
      <PendingItemsView />
    </Suspense>
  );
}
