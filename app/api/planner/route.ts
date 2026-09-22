import { getPlannerData } from '@/lib/planner';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') ?? 14);
    return Response.json(await getPlannerData(days));
  } catch (error) {
    console.error(error);
    return Response.json({ error: '暂时无法读取事项数据' }, { status: 500 });
  }
}
