'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  FolderKanban,
  Layers3,
  ListTree,
  LogOut,
  Plus,
  Repeat2,
  SunMedium,
  Target,
} from 'lucide-react';
import {
  CreateStructureDialog,
  type StructureKind,
} from '@/components/planner/create-structure-dialog';
import { CreateTaskDialog } from '@/components/planner/create-task-dialog';
import { TaskRow, TaskRowSkeleton } from '@/components/planner/task-row';
import { PlannerWebMcpTools } from '@/components/planner/webmcp-tools';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { addDays, dateInTimeZone } from '@/lib/date';
import type {
  PlannerData,
  PlannerOccurrence,
  TaskDefinitionSummary,
  TaskStatus,
} from '@/lib/planner-types';

type View = 'today' | 'upcoming' | 'plan';
type PlanFilter = 'all' | 'undated';

function longDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${date}T00:00:00`));
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  );
}

function isTodayOccurrence(occurrence: PlannerOccurrence, today: string) {
  if (occurrence.type === 'RECURRING') return occurrence.scheduledDate === today;
  return occurrence.dueDate === today;
}

function occurrencePlanDate(occurrence: PlannerOccurrence) {
  return occurrence.type === 'RECURRING' ? occurrence.scheduledDate : occurrence.dueDate;
}

export function PlannerApp({ initialData }: { initialData: PlannerData }) {
  const [activeView, setActiveView] = useState<View>('today');
  const [data, setData] = useState<PlannerData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newStructureKind, setNewStructureKind] = useState<StructureKind | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [upcomingDays, setUpcomingDays] = useState(14);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2600);
  }, []);

  const refresh = useCallback(async (days = upcomingDays) => {
    try {
      const response = await fetch(`/api/planner?days=${days}`, { cache: 'no-store' });
      const result = (await response.json()) as PlannerData & { error?: string };
      if (!response.ok) throw new Error(result.error || '无法读取事项数据');
      setData(result);
      setError('');
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '无法读取事项数据');
    } finally {
      setLoading(false);
    }
  }, [upcomingDays]);

  const derived = useMemo(() => {
    if (!data) {
      return { overdue: [], today: [], completedToday: [], handledToday: [], upcoming: [], undated: [], redCount: 0, yellowCount: 0 };
    }
    const pending = data.occurrences.filter((occurrence) => occurrence.status === 'PENDING');
    const overdue = pending.filter((occurrence) => occurrence.dueDate && occurrence.dueDate < data.today);
    const today = pending.filter((occurrence) => isTodayOccurrence(occurrence, data.today));
    const completedToday = data.occurrences.filter(
      (occurrence) => occurrence.status === 'COMPLETED' && isTodayOccurrence(occurrence, data.today),
    );
    const handledToday = data.occurrences.filter((occurrence) => {
      const actionAt = occurrence.status === 'COMPLETED' ? occurrence.completedAt : occurrence.status === 'CANCELLED' ? occurrence.cancelledAt : null;
      return Boolean(actionAt && dateInTimeZone(actionAt, data.timeZone) === data.today);
    });
    const rangeEnd = addDays(data.today, data.upcomingDays);
    const upcoming = pending.filter((occurrence) => {
      const planDate = occurrencePlanDate(occurrence);
      return Boolean(planDate && planDate > data.today && planDate <= rangeEnd);
    });
    const undated = data.taskDefinitions.filter(
      (task) => task.type === 'ONE_TIME' && !task.ownDueDate && task.pendingCount > 0,
    );
    return {
      overdue,
      today,
      completedToday,
      handledToday,
      upcoming,
      undated,
      redCount: new Set([...overdue, ...today].map((occurrence) => occurrence.id)).size,
      yellowCount: upcoming.length,
    };
  }, [data]);

  const changeStatus = async (id: string, status: TaskStatus) => {
    if (!data) return;
    const previousData = data;
    const now = new Date().toISOString();
    setData({
      ...data,
      occurrences: data.occurrences.map((occurrence) =>
        occurrence.id === id
          ? { ...occurrence, status, completedAt: status === 'COMPLETED' ? now : null }
          : occurrence,
      ),
    });
    try {
      const response = await fetch(`/api/occurrences/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '无法更新任务');
      showNotice(status === 'COMPLETED' ? '任务已完成' : status === 'CANCELLED' ? '任务已取消' : '任务已重新打开');
      await refresh();
    } catch (updateError) {
      setData(previousData);
      setError(updateError instanceof Error ? updateError.message : '无法更新任务');
    }
  };

  const changeUpcomingRange = (days: number) => {
    setUpcomingDays(days);
    setLoading(true);
    void refresh(days);
  };

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  };

  const navItems: Array<{
    id: View;
    label: string;
    icon: typeof SunMedium;
    count?: number;
    badgeTone?: 'red' | 'amber';
  }> = [
    { id: 'today', label: '今日任务', icon: SunMedium, count: derived.redCount, badgeTone: 'red' },
    { id: 'upcoming', label: '近期任务', icon: CalendarRange, count: derived.yellowCount, badgeTone: 'amber' },
    { id: 'plan', label: '总事项安排', icon: ListTree },
  ];

  const headings = {
    today: ['今日任务', data ? `还有 ${derived.redCount} 项需要处理，先完成最重要的一件。` : '正在整理今天的事项。'],
    upcoming: ['近期任务', `查看未来 ${data?.upcomingDays ?? upcomingDays} 天的任务与循环安排。`],
    plan: ['总事项安排', '按领域、目标和项目检查完整计划。'],
  } as const;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 md:flex">
        <Brand />
        <nav className="mt-9 space-y-1" aria-label="主导航">
          {navItems.map((item) => (
            <NavButton key={item.id} item={item} active={activeView === item.id} onClick={() => setActiveView(item.id)} />
          ))}
        </nav>

        <div className="mt-8 px-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">领域</p>
            <button
              type="button"
              className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              onClick={() => setNewStructureKind('AREA')}
              aria-label="新建领域"
              title="新建领域"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="mt-3 space-y-3 text-sm">
            {(data?.areas ?? []).map((area) => (
              <div key={area.id} className="flex items-center gap-3 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: area.color }} />
                <span className="flex-1 truncate">{area.name}</span>
                <span className="text-xs tabular-nums">{area.taskCount}</span>
              </div>
            ))}
            {loading && !data ? <span className="block h-14 animate-pulse rounded-xl bg-muted" /> : null}
            {data && !data.areas.length ? (
              <button type="button" className="text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => setNewStructureKind('AREA')}>
                暂无领域，点击创建
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="pb-24 md:ml-[252px] md:pb-0">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/88 px-5 py-4 backdrop-blur-xl md:px-8 lg:px-12">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:hidden"><Brand compact /></div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-muted-foreground">今天</p>
              <p className="text-sm font-semibold">{data ? longDate(data.today) : '正在读取日期'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => void logout()} disabled={loggingOut} aria-label="退出登录" title="退出登录">
                <LogOut className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={!data}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  <span>新建<span className="hidden sm:inline">事项</span></span>
                  <ChevronDown className="size-3.5 opacity-75" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>选择事项类型</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setNewStructureKind('AREA')}>
                      <Layers3 />领域
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!data?.areas.length} onClick={() => setNewStructureKind('GOAL')}>
                      <Target />目标
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!data?.goals.length} onClick={() => setNewStructureKind('PROJECT')}>
                      <FolderKanban />项目
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!data?.goals.length} onClick={() => setNewTaskOpen(true)}>
                    <Check />任务
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1260px] px-5 py-7 md:px-8 lg:px-12 lg:py-10">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <span className="size-2 rounded-full bg-primary shadow-[0_0_0_5px_rgba(79,70,229,.10)]" />
                {activeView === 'today' && data ? longDate(data.today) : activeView === 'upcoming' ? '向前看一步' : '完整计划'}
              </div>
              <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-bold tracking-[-0.045em]">{headings[activeView][0]}</h1>
              <p className="mt-2 text-[15px] text-muted-foreground">{headings[activeView][1]}</p>
            </div>
            {activeView === 'today' && data ? (
              <div className="hidden text-right sm:block">
                <p className="text-2xl font-bold tabular-nums">{derived.completedToday.length}/{derived.today.length + derived.completedToday.length}</p>
                <p className="text-xs text-muted-foreground">今日进度</p>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <span>{error}</span><Button variant="ghost" size="sm" onClick={() => void refresh()}>重试</Button>
            </div>
          ) : null}

          {activeView === 'today' ? (
            <TodayView data={data} loading={loading} derived={derived} onStatusChange={changeStatus} onOpenUpcoming={() => setActiveView('upcoming')} />
          ) : null}
          {activeView === 'upcoming' ? (
            <UpcomingView data={data} loading={loading} occurrences={derived.upcoming} upcomingDays={upcomingDays} onRangeChange={changeUpcomingRange} onStatusChange={changeStatus} />
          ) : null}
          {activeView === 'plan' ? (
            <PlanView
              data={data}
              loading={loading}
              undatedCount={derived.undated.length}
              onCreateArea={() => setNewStructureKind('AREA')}
              onCreateGoal={() => setNewStructureKind('GOAL')}
              onCreateProject={() => setNewStructureKind('PROJECT')}
              onCreateTask={() => setNewTaskOpen(true)}
            />
          ) : null}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-background/94 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden" aria-label="移动端主导航">
        {navItems.map((item) => (
          <NavButton key={item.id} item={item} active={activeView === item.id} mobile onClick={() => setActiveView(item.id)} />
        ))}
      </nav>

      {notice ? (
        <output className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-xl md:bottom-8" aria-live="polite">
          {notice}
        </output>
      ) : null}

      {data ? (
        <>
          <PlannerWebMcpTools data={data} onRefresh={refresh} onNotice={showNotice} />
          {(['AREA', 'GOAL', 'PROJECT'] as const).map((kind) => (
            <CreateStructureDialog
              key={`${kind}-${data.areas.map((area) => area.id).join('-')}-${data.goals.map((goal) => goal.id).join('-')}`}
              kind={kind}
              open={newStructureKind === kind}
              onOpenChange={(open) => setNewStructureKind(open ? kind : null)}
              areas={data.areas}
              goals={data.goals}
              today={data.today}
              onCreated={async () => {
                await refresh();
                showNotice(`${kind === 'AREA' ? '领域' : kind === 'GOAL' ? '目标' : '项目'}已创建`);
              }}
            />
          ))}
          <CreateTaskDialog
            key={`task-${data.goals.map((goal) => goal.id).join('-')}-${data.projects.map((project) => project.id).join('-')}`}
            open={newTaskOpen}
            onOpenChange={setNewTaskOpen}
            goals={data.goals}
            projects={data.projects}
            today={data.today}
            onCreated={async () => {
              await refresh();
              showNotice('任务已创建');
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'px-2'}`}>
      <Image
        src="/app-icon.png"
        alt=""
        aria-hidden="true"
        width={40}
        height={40}
        className={`${compact ? 'size-9 rounded-xl' : 'size-10 rounded-[14px]'} shadow-[0_8px_24px_rgba(79,70,229,.24)]`}
      />
      <div>
        <p className="text-[1.05rem] font-bold tracking-[-0.02em]">序时</p>
        {!compact ? <p className="text-xs text-muted-foreground">把计划变成今天</p> : null}
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  mobile = false,
  onClick,
}: {
  item: { id: View; label: string; icon: typeof SunMedium; count?: number; badgeTone?: 'red' | 'amber' };
  active: boolean;
  mobile?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  if (mobile) {
    return (
      <button type="button" onClick={onClick} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
        <span className="relative">
          <Icon className="size-5" />
          {item.count ? <CountBadge count={item.count} tone={item.badgeTone} className="absolute -right-3.5 -top-2" /> : null}
        </span>
        {item.label.replace('任务', '')}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/55 hover:text-foreground'}`}>
      <Icon className={`size-[19px] ${active ? 'text-primary' : ''}`} />
      <span className="flex-1">{item.label}</span>
      {item.count ? <CountBadge count={item.count} tone={item.badgeTone} /> : null}
    </button>
  );
}

function CountBadge({ count, tone, className = '' }: { count: number; tone?: 'red' | 'amber'; className?: string }) {
  return (
    <span className={`grid min-w-[22px] place-items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white ${tone === 'red' ? 'bg-red-500' : 'bg-amber-500'} ${className}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function TodayView({
  data,
  loading,
  derived,
  onStatusChange,
  onOpenUpcoming,
}: {
  data: PlannerData | null;
  loading: boolean;
  derived: { overdue: PlannerOccurrence[]; today: PlannerOccurrence[]; completedToday: PlannerOccurrence[]; handledToday: PlannerOccurrence[]; upcoming: PlannerOccurrence[]; undated: TaskDefinitionSummary[] };
  onStatusChange: (id: string, status: TaskStatus) => void;
  onOpenUpcoming: () => void;
}) {
  const [showOverdue, setShowOverdue] = useState(true);
  if (loading && !data) return <LoadingList />;
  if (!data) return null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 space-y-7">
        {derived.overdue.length ? (
          <div className="overflow-hidden rounded-2xl border border-red-200/80 bg-red-50/70">
            <button type="button" onClick={() => setShowOverdue((value) => !value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5">
              <span className="grid size-9 place-items-center rounded-xl bg-red-100 text-red-600"><CircleAlert className="size-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-red-950">{derived.overdue.length} 项任务已逾期</span>
                <span className="mt-0.5 block truncate text-xs text-red-700/75">逾期任务会一直保留，直到完成或取消</span>
              </span>
              <span className="flex items-center gap-1 text-sm font-medium text-red-700">{showOverdue ? '收起' : '查看'}<ChevronRight className={`size-4 transition-transform ${showOverdue ? 'rotate-90' : ''}`} /></span>
            </button>
            {showOverdue ? (
              <div className="space-y-2 border-t border-red-200/70 p-3 sm:p-4">
                {derived.overdue.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} onStatusChange={onStatusChange} compact />)}
              </div>
            ) : null}
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">今天</h2>
            <Badge variant="secondary" className="rounded-full font-medium">{derived.today.length}</Badge>
          </div>
          {derived.today.length ? (
            <div className="space-y-2.5">
              {derived.today.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} onStatusChange={onStatusChange} />)}
            </div>
          ) : (
            <Empty className="border border-dashed border-border bg-card py-10">
              <EmptyHeader><EmptyMedia variant="icon"><Check /></EmptyMedia><EmptyTitle>今天已经清空</EmptyTitle><EmptyDescription>没有待处理的今日任务。</EmptyDescription></EmptyHeader>
            </Empty>
          )}
        </section>

        {derived.handledToday.length ? (
          <details className="rounded-2xl border border-dashed border-border bg-card/60">
            <summary className="cursor-pointer list-none px-4 py-4 text-sm font-medium text-muted-foreground">今天已处理 {derived.handledToday.length} 项</summary>
            <div className="space-y-2 border-t border-border p-3">
              {derived.handledToday.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} onStatusChange={onStatusChange} compact />)}
            </div>
          </details>
        ) : null}
      </section>

      <RightRail data={data} todayCount={derived.today.length} completedCount={derived.completedToday.length} upcomingCount={derived.upcoming.length} onOpenUpcoming={onOpenUpcoming} />
    </div>
  );
}

function RightRail({ data, todayCount, completedCount, upcomingCount, onOpenUpcoming }: { data: PlannerData; todayCount: number; completedCount: number; upcomingCount: number; onOpenUpcoming: () => void }) {
  const total = todayCount + completedCount;
  const completedByDay = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(data.today, index - 3);
    return data.occurrences.filter((item) => item.status === 'COMPLETED' && item.completedAt?.slice(0, 10) === date).length;
  });
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-28 space-y-4">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">本周节奏</h2><span className="text-xs font-semibold text-emerald-600">{total && completedCount === total ? '今日清空' : '稳步推进'}</span></div>
          <div className="mt-5 flex h-24 items-end justify-between gap-2" aria-label="近期完成趋势">
            {completedByDay.map((count, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <span className={`w-full max-w-6 rounded-t-md ${index === 3 ? 'bg-primary' : 'bg-primary/12'}`} style={{ height: `${Math.max(12, count * 22)}px` }} />
                <span className="text-[11px] text-muted-foreground">{['六', '日', '一', '今', '三', '四', '五'][index]}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-[linear-gradient(145deg,#171b2e,#252b48)] p-5 text-white shadow-[0_18px_40px_rgba(23,27,46,.18)]">
          <p className="text-xs font-medium text-white/55">即将到来</p>
          <h2 className="mt-2 text-lg font-semibold">{upcomingCount} 项近期任务</h2>
          <p className="mt-1 text-sm leading-6 text-white/65">未来 {data.upcomingDays} 天的安排已按日期整理。</p>
          <Button variant="secondary" onClick={onOpenUpcoming} className="mt-5 w-full rounded-xl bg-white text-slate-900 hover:bg-white/90">查看近期安排</Button>
        </section>
      </div>
    </aside>
  );
}

function UpcomingView({ data, loading, occurrences, upcomingDays, onRangeChange, onStatusChange }: { data: PlannerData | null; loading: boolean; occurrences: PlannerOccurrence[]; upcomingDays: number; onRangeChange: (days: number) => void; onStatusChange: (id: string, status: TaskStatus) => void }) {
  const grouped = useMemo(() => {
    const groups = new Map<string, PlannerOccurrence[]>();
    for (const occurrence of occurrences) {
      const date = occurrencePlanDate(occurrence);
      if (!date) continue;
      groups.set(date, [...(groups.get(date) ?? []), occurrence]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [occurrences]);

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 pl-4">
        <div><p className="text-sm font-semibold">查看范围</p><p className="text-xs text-muted-foreground">今天之后，不包含逾期任务</p></div>
        <NativeSelect value={String(upcomingDays)} onChange={(event) => onRangeChange(Number(event.target.value))}>
          <NativeSelectOption value="7">未来 7 天</NativeSelectOption>
          <NativeSelectOption value="14">未来 14 天</NativeSelectOption>
          <NativeSelectOption value="30">未来 30 天</NativeSelectOption>
        </NativeSelect>
      </div>
      {loading && !data ? <LoadingList /> : null}
      {!loading && data && !grouped.length ? (
        <Empty className="border border-dashed border-border bg-card py-14"><EmptyHeader><EmptyMedia variant="icon"><CalendarRange /></EmptyMedia><EmptyTitle>近期没有任务</EmptyTitle><EmptyDescription>新的截止日期或循环实例会显示在这里。</EmptyDescription></EmptyHeader></Empty>
      ) : null}
      <div className="space-y-8">
        {data ? grouped.map(([date, items]) => (
          <section key={date}>
            <div className="mb-3 flex items-center gap-3"><h2 className="font-semibold">{longDate(date)}</h2><span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">{items.length} 项</span></div>
            <div className="space-y-2.5">{items.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} onStatusChange={onStatusChange} />)}</div>
          </section>
        )) : null}
      </div>
    </section>
  );
}

function PlanView({
  data,
  loading,
  undatedCount,
  onCreateArea,
  onCreateGoal,
  onCreateProject,
  onCreateTask,
}: {
  data: PlannerData | null;
  loading: boolean;
  undatedCount: number;
  onCreateArea: () => void;
  onCreateGoal: () => void;
  onCreateProject: () => void;
  onCreateTask: () => void;
}) {
  const [filter, setFilter] = useState<PlanFilter>('all');
  if (loading && !data) return <LoadingList />;
  if (!data) return null;

  if (!data.areas.length) {
    return (
      <Empty className="border border-dashed border-border bg-card py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Layers3 /></EmptyMedia>
          <EmptyTitle>从第一个领域开始</EmptyTitle>
          <EmptyDescription>领域是目标、项目和任务的最上层归类，例如工作、健康或个人成长。</EmptyDescription>
        </EmptyHeader>
        <Button className="mt-2 rounded-xl" onClick={onCreateArea}><Plus className="size-4" />创建领域</Button>
      </Empty>
    );
  }

  const visibleTask = (task: TaskDefinitionSummary) => filter === 'all' || (task.type === 'ONE_TIME' && !task.ownDueDate && task.pendingCount > 0);

  return (
    <section>
      {!data.goals.length ? (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">领域已经准备好了</p><p className="mt-1 text-sm text-muted-foreground">下一步创建目标，之后就可以继续添加项目或直接任务。</p></div>
          <Button className="shrink-0 rounded-xl" onClick={onCreateGoal}><Plus className="size-4" />创建目标</Button>
        </div>
      ) : null}
      {data.goals.length && !data.taskDefinitions.length ? (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">目标已经建立</p><p className="mt-1 text-sm text-muted-foreground">任务可以直接属于目标，也可以先创建项目再归入任务。</p></div>
          <div className="flex shrink-0 gap-2"><Button variant="outline" className="rounded-xl" onClick={onCreateProject}><FolderKanban className="size-4" />创建项目</Button><Button className="rounded-xl" onClick={onCreateTask}><Plus className="size-4" />创建任务</Button></div>
        </div>
      ) : null}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setFilter('all')}><ListTree className="size-4" />全部事项</Button>
        <Button variant={filter === 'undated' ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setFilter('undated')}><CircleDashed className="size-4" />未安排截止日期 {undatedCount}</Button>
      </div>

      <div className="space-y-5">
        {data.areas.map((area) => {
          const areaGoals = data.goals.filter((goal) => goal.areaId === area.id);
          const hasVisibleTasks = areaGoals.some((goal) => data.taskDefinitions.some((task) => task.goalId === goal.id && visibleTask(task)));
          if (filter === 'undated' && !hasVisibleTasks) return null;
          return (
            <section key={area.id} className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_8px_28px_rgba(15,23,42,.035)]">
              <header className="flex items-center gap-3 border-b border-border bg-muted/35 px-5 py-4">
                <span className="size-3 rounded-full" style={{ background: area.color }} />
                <h2 className="font-bold">{area.name}</h2>
                <span className="text-xs text-muted-foreground">{area.taskCount} 项任务</span>
              </header>
              <div className="divide-y divide-border">
                {areaGoals.map((goal) => {
                  const directTasks = data.taskDefinitions.filter((task) => task.goalId === goal.id && !task.projectId && visibleTask(task));
                  const goalProjects = data.projects.filter((project) => project.goalId === goal.id);
                  const visibleProjects = filter === 'all'
                    ? goalProjects
                    : goalProjects.filter((project) => data.taskDefinitions.some((task) => task.projectId === project.id && visibleTask(task)));
                  if (filter === 'undated' && !directTasks.length && !visibleProjects.length) return null;
                  return (
                    <details key={goal.id} open className="group/goal">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-muted/25">
                        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Target className="size-[18px]" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{goal.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{goal.ownDueDate ? `${shortDate(goal.ownDueDate)} 截止` : '未设置目标截止日期'}</span></span>
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/goal:rotate-90" />
                      </summary>
                      <div className="border-t border-border/70 bg-background/45 px-4 py-3 sm:pl-10">
                        {directTasks.length ? <div className="space-y-2 pb-3">{directTasks.map((task) => <PlanTaskRow key={task.id} task={task} />)}</div> : null}
                        <div className="space-y-3">
                          {visibleProjects.map((project) => {
                            const projectTasks = data.taskDefinitions.filter((task) => task.projectId === project.id && visibleTask(task));
                            return (
                              <details key={project.id} open className="group/project rounded-2xl border border-border bg-card">
                                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
                                  <FolderKanban className="size-[18px] text-primary" />
                                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{project.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{project.ownDueDate ? `${shortDate(project.ownDueDate)} 截止` : '跟随目标时间边界'}</span></span>
                                  <Badge variant="secondary" className="rounded-full">{projectTasks.length}</Badge>
                                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/project:rotate-90" />
                                </summary>
                                <div className="space-y-2 border-t border-border p-3">{projectTasks.map((task) => <PlanTaskRow key={task.id} task={task} />)}</div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function PlanTaskRow({ task }: { task: TaskDefinitionSummary }) {
  const recurrenceLabel = task.type === 'RECURRING'
    ? task.frequency === 'WEEKLY'
      ? task.interval === 1 ? '每周' : `每 ${task.interval} 周`
      : task.interval === 1 ? '每天' : `每 ${task.interval} 天`
    : null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-3">
      <span className={`grid size-7 place-items-center rounded-lg ${task.type === 'RECURRING' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
        {task.type === 'RECURRING' ? <Repeat2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{task.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{recurrenceLabel ?? (task.ownDueDate ? `${shortDate(task.ownDueDate)} 截止` : '未安排截止日期')}</span></span>
      <span className="text-xs text-muted-foreground">{task.pendingCount ? `${task.pendingCount} 待处理` : task.completedCount ? '已完成' : '已取消'}</span>
    </div>
  );
}

function LoadingList() {
  return <div className="space-y-3"><TaskRowSkeleton /><TaskRowSkeleton /><TaskRowSkeleton /></div>;
}
