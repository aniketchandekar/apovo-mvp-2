import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ApplicationWorkspace } from '@/components/application-agent/ApplicationWorkspace';

async function WorkspaceContent({
  searchParams,
}: {
  searchParams: Promise<{ run?: string | string[]; demo?: string | string[] }>;
}) {
  const query = await searchParams;
  const runId = Array.isArray(query.run) ? query.run[0] : query.run;
  if (!runId) redirect('/resources');
  const demo = (Array.isArray(query.demo) ? query.demo[0] : query.demo) === '1';
  return <ApplicationWorkspace runId={runId} demo={demo} />;
}

export default function WorkspacePage({
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string | string[]; demo?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<main className="workspace-message">Opening your application workspace…</main>}>
      <WorkspaceContent searchParams={searchParams} />
    </Suspense>
  );
}
