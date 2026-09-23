import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PlannerApp } from '@/components/planner/planner-app';
import { getAuthStatus } from '@/lib/auth';
import { getPlannerData } from '@/lib/planner';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const requestHeaders = await headers();
  const auth = await getAuthStatus(requestHeaders.get('cookie'));
  if (!auth.authenticated) redirect('/login');

  const initialData = await getPlannerData(14);
  return <PlannerApp initialData={initialData} />;
}
