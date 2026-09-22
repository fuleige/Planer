import { PlannerApp } from '@/components/planner/planner-app';
import { getPlannerData } from '@/lib/planner';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const initialData = await getPlannerData(14);
  return <PlannerApp initialData={initialData} />;
}
