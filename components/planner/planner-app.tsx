'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Ban,
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
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Repeat2,
  RotateCcw,
  SunMedium,
  Target,
  Trash2,
} from 'lucide-react';
import {
  CreateStructureDialog,
  type StructureKind,
} from '@/components/planner/create-structure-dialog';
import { CreateTaskDialog } from '@/components/planner/create-task-dialog';
import { TrashDialog } from '@/components/planner/trash-dialog';
import { TaskRow, TaskRowSkeleton } from '@/components/planner/task-row';
import { TaskInstancesDialog } from '@/components/planner/task-instances-dialog';
import { RescheduleOverdueDialog } from '@/components/planner/reschedule-overdue-dialog';
import { WeeklyHandledCard } from '@/components/planner/weekly-handled-card';
import { PlannerWebMcpTools } from '@/components/planner/webmcp-tools';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { addDays, dateInTimeZone, minDate, parseDate, weekStart } from '@/lib/date';
import { DEFAULT_AREA_COLOR } from '@/lib/area-colors';
import { timeStatusLabel, type TimeStatus } from '@/lib/duration';
import type {
  AreaSummary,
  GoalSummary,
  PlannerData,
  PlannerOccurrence,
  ProjectSummary,
  TaskDefinitionSummary,
  TaskStatus,
} from '@/lib/planner-types';

type View = 'today' | 'upcoming' | 'plan';
type PlanFilter = 'all' | 'undated';
type ManageKind = 'AREA' | 'GOAL' | 'PROJECT' | 'TASK';
type ManageTarget = { kind: ManageKind; id: string };
type NewStructureRequest = { kind: StructureKind; parentId?: string; sequence: number };
type NewTaskRequest = { goalId?: string; projectId?: string; sequence: number };
type ActionTarget = {
  kind: 'TASK' | 'GOAL' | 'PROJECT' | 'OCCURRENCE';
  id: string;
  title: string;
  action: 'STOP' | 'RESUME' | 'COMPLETE' | 'REOPEN' | 'ABANDON' | 'RESTORE' | 'CLEAR' | 'WEEK_COMPLETE';
};

const manageLabels: Record<ManageKind, string> = { AREA: '领域', GOAL: '目标', PROJECT: '项目', TASK: '任务' };
const manageEndpoints: Record<ManageKind, string> = { AREA: '/api/areas', GOAL: '/api/goals', PROJECT: '/api/projects', TASK: '/api/tasks' };

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
  if (occurrence.type === 'RECURRING') return occurrence.scheduledDate === today || occurrence.dueDate === today;
  return occurrence.dueDate === today;
}

function occurrencePlanDate(occurrence: PlannerOccurrence) {
  return occurrence.type === 'RECURRING' ? occurrence.scheduledDate : occurrence.dueDate;
}

function canManageDefinition(data: PlannerData, occurrence: PlannerOccurrence) {
  return data.goals.some((goal) => goal.id === occurrence.goalId && goal.status === 'ACTIVE')
    && (!occurrence.projectId || data.projects.some((project) => project.id === occurrence.projectId && project.status === 'ACTIVE'));
}

function parentBlockReason(data: PlannerData, goalId: string, projectId: string | null) {
  const goal = data.goals.find((item) => item.id === goalId);
  const project = projectId ? data.projects.find((item) => item.id === projectId) : null;
  if (goal?.status === 'COMPLETED') return '请先手动重新打开所属目标';
  if (goal?.status === 'ABANDONED') return '请先恢复所属目标';
  if (project?.status === 'COMPLETED') return '请先手动重新打开所属项目';
  if (project?.status === 'ABANDONED') return '请先恢复所属项目';
  return null;
}

function occurrenceUndoBlockReason(data: PlannerData, occurrence: PlannerOccurrence) {
  if (occurrence.dueDate && occurrence.dueDate < data.today) return '已超过截止日期，不能撤回';
  const parentReason = parentBlockReason(data, occurrence.goalId, occurrence.projectId);
  if (parentReason) return parentReason;
  const task = data.taskDefinitions.find((item) => item.id === occurrence.taskId);
  if (task?.currentWeekCompleted && occurrence.frequency === 'WEEKLY' && weekStart(occurrence.scheduledDate) === weekStart(data.today)) {
    return '请先撤回本周完成';
  }
  return null;
}

export function PlannerApp({ initialData, initialView = 'today' }: { initialData: PlannerData; initialView?: View }) {
  const [activeView, setActiveView] = useState<View>(initialView);
  const [data, setData] = useState<PlannerData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newTaskRequest, setNewTaskRequest] = useState<NewTaskRequest | null>(null);
  const [newStructureRequest, setNewStructureRequest] = useState<NewStructureRequest | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [instancesTaskId, setInstancesTaskId] = useState<string | null>(null);
  const [rescheduleOccurrenceId, setRescheduleOccurrenceId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const [editTarget, setEditTarget] = useState<ManageTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManageTarget | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [upcomingDays, setUpcomingDays] = useState(initialData.upcomingDays);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createSequence = useRef(0);

  useEffect(() => {
    const restoreViewFromUrl = () => {
      const view = new URLSearchParams(window.location.search).get('view');
      setActiveView(view === 'upcoming' || view === 'plan' ? view : 'today');
    };
    window.addEventListener('popstate', restoreViewFromUrl);
    return () => window.removeEventListener('popstate', restoreViewFromUrl);
  }, []);

  const navigateView = (view: View) => {
    if (view === activeView) return;
    const url = new URL(window.location.href);
    if (view === 'today') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    window.history.pushState(null, '', url);
    setActiveView(view);
  };

  const openNewStructure = (kind: StructureKind, parentId?: string) => {
    createSequence.current += 1;
    setNewStructureRequest({ kind, parentId, sequence: createSequence.current });
  };

  const openNewTask = (goalId?: string, projectId?: string) => {
    createSequence.current += 1;
    setNewTaskRequest({ goalId, projectId, sequence: createSequence.current });
  };

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
      return { overdue: [], today: [], completedToday: [], weeklyHandled: [], otherHandled: [], upcoming: [], undated: [], redCount: 0, yellowCount: 0 };
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
    const handledWeeklyOccurrences = handledToday.filter((occurrence) => occurrence.frequency === 'WEEKLY' && occurrence.scheduledDate === data.today);
    const weeklyHandled = data.taskDefinitions
      .filter((task) => task.frequency === 'WEEKLY' && (task.currentWeekCompleted || handledWeeklyOccurrences.some((occurrence) => occurrence.taskId === task.id)))
      .map((task) => ({ task, occurrence: handledWeeklyOccurrences.find((occurrence) => occurrence.taskId === task.id) }));
    const otherHandled = handledToday.filter((occurrence) => occurrence.frequency !== 'WEEKLY');
    const rangeEnd = addDays(data.today, data.upcomingDays);
    const upcoming = pending.filter((occurrence) => {
      if (occurrence.type === 'RECURRING') return false;
      const planDate = occurrencePlanDate(occurrence);
      return Boolean(planDate && planDate > data.today && planDate <= rangeEnd);
    });
    const undated = data.taskDefinitions.filter(
      (task) => task.type === 'ONE_TIME' ? !task.ownDueDate : !task.ownEndDate,
    );
    return {
      overdue,
      today,
      completedToday,
      weeklyHandled,
      otherHandled,
      upcoming,
      undated,
      redCount: new Set([...overdue, ...today].map((occurrence) => occurrence.id)).size,
      yellowCount: upcoming.length,
    };
  }, [data]);

  const changeStatus = async (id: string, status: TaskStatus) => {
    if (!data) return { ok: false, error: '事项数据尚未载入' };
    const target = data.occurrences.find((occurrence) => occurrence.id === id);
    if (status === 'PENDING' && target) {
      const reason = occurrenceUndoBlockReason(data, target);
      if (reason) return { ok: false, error: reason };
    }
    const previousData = data;
    const now = new Date().toISOString();
    setData({
      ...data,
      occurrences: data.occurrences.map((occurrence) =>
        occurrence.id === id
          ? { ...occurrence, status, completedAt: status === 'COMPLETED' ? now : null, cancelledAt: status === 'CANCELLED' ? now : null }
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
      showNotice(status === 'COMPLETED' ? '任务已完成，可在“已处理”撤回' : status === 'CANCELLED' ? `${target?.type === 'RECURRING' ? '今日已跳过' : '任务已取消'}，可在“已处理”撤回` : '任务已重新打开');
      await refresh();
      return { ok: true };
    } catch (updateError) {
      setData(previousData);
      const message = updateError instanceof Error ? updateError.message : '无法更新任务';
      setError(message);
      return { ok: false, error: message };
    }
  };

  const changeUpcomingRange = (days: number) => {
    setUpcomingDays(days);
    setLoading(true);
    void refresh(days);
  };

  const openCycleAction = (id: string, running: boolean) => {
    const task = data?.taskDefinitions.find((item) => item.id === id);
    if (!task) return;
    setActionError('');
    setActionTarget({ kind: 'TASK', id, title: task.title, action: running ? 'RESUME' : 'STOP' });
  };

  const openCompletionAction = (kind: 'GOAL' | 'PROJECT', id: string, completed: boolean) => {
    const item = kind === 'GOAL' ? data?.goals.find((goal) => goal.id === id) : data?.projects.find((project) => project.id === id);
    if (!item) return;
    setActionError('');
    setActionTarget({ kind, id, title: item.title, action: completed ? 'COMPLETE' : 'REOPEN' });
  };

  const openAbandonAction = (kind: 'GOAL' | 'PROJECT', id: string, abandoned: boolean) => {
    const item = kind === 'GOAL' ? data?.goals.find((goal) => goal.id === id) : data?.projects.find((project) => project.id === id);
    if (!item) return;
    setActionError('');
    setActionTarget({ kind, id, title: item.title, action: abandoned ? 'ABANDON' : 'RESTORE' });
  };

  const clearOverdue = (id: string) => {
    const occurrence = data?.occurrences.find((item) => item.id === id);
    if (!occurrence) return;
    setActionError('');
    setActionTarget({ kind: 'OCCURRENCE', id, title: `${occurrence.title}（${occurrence.dueDate ?? occurrence.scheduledDate}）`, action: 'CLEAR' });
  };

  const openRescheduleOverdue = (id: string) => {
    if (!data) return;
    const occurrence = data.occurrences.find((item) => item.id === id);
    if (occurrence?.type === 'ONE_TIME' && occurrence.status === 'PENDING' && occurrence.dueDate && occurrence.dueDate < data.today) {
      setRescheduleOccurrenceId(id);
    }
  };

  const openWeekCompleteAction = (id: string) => {
    const task = data?.taskDefinitions.find((item) => item.id === id);
    if (!task) return;
    setActionError('');
    setActionTarget({ kind: 'TASK', id, title: task.title, action: 'WEEK_COMPLETE' });
  };

  const changeWeekCompletion = async (id: string, completed: boolean) => {
    try {
      const response = await fetch(`/api/tasks/${id}/week`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '无法更新本周循环');
      await refresh();
      showNotice(completed ? '本周已完成，下个循环周再提醒' : '已撤销本周完成');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法更新本周循环');
    }
  };

  const performAction = async () => {
    if (!actionTarget) return;
    setActing(true);
    setActionError('');
    try {
      const endpoint = actionTarget.kind === 'OCCURRENCE' ? `/api/occurrences/${actionTarget.id}`
        : actionTarget.action === 'WEEK_COMPLETE' ? `/api/tasks/${actionTarget.id}/week`
          : actionTarget.kind === 'TASK' ? `/api/tasks/${actionTarget.id}/cycle`
          : `${manageEndpoints[actionTarget.kind]}/${actionTarget.id}/${actionTarget.action === 'ABANDON' || actionTarget.action === 'RESTORE' ? 'abandon' : 'completion'}`;
      const body = actionTarget.action === 'WEEK_COMPLETE' ? { completed: true }
        : actionTarget.kind === 'TASK' ? { running: actionTarget.action === 'RESUME' }
          : actionTarget.action === 'ABANDON' || actionTarget.action === 'RESTORE'
            ? { abandoned: actionTarget.action === 'ABANDON' }
            : { completed: actionTarget.action === 'COMPLETE' };
      const response = await fetch(endpoint, {
        method: actionTarget.action === 'CLEAR' ? 'DELETE' : actionTarget.kind === 'OCCURRENCE' ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: actionTarget.action === 'CLEAR' ? undefined : JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '无法完成操作');
      const notice = actionTarget.action === 'CLEAR' ? data?.occurrences.find((item) => item.id === actionTarget.id)?.type === 'ONE_TIME' ? '逾期任务已删除，可从回收站恢复' : '本条循环逾期已删除'
        : actionTarget.action === 'WEEK_COMPLETE' ? '本周已完成，今日不会计为完成'
        : actionTarget.action === 'STOP' ? '循环已停止，历史实例仍保留'
        : actionTarget.action === 'RESUME' ? '循环已恢复'
          : actionTarget.action === 'COMPLETE' ? `${manageLabels[actionTarget.kind as 'GOAL' | 'PROJECT']}已确认完成`
            : actionTarget.action === 'ABANDON' ? '事项已放弃，未处理任务已取消'
              : actionTarget.action === 'RESTORE' ? '事项已恢复，原任务仍保持取消状态'
                : '事项已重新打开';
      setActionTarget(null);
      await refresh();
      showNotice(notice);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : '无法完成操作');
    } finally {
      setActing(false);
    }
  };

  const openDelete = (target: ManageTarget) => {
    setDeleteError('');
    setDeleteTarget(target);
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`${manageEndpoints[deleteTarget.kind]}/${deleteTarget.id}`, { method: 'DELETE' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '无法删除事项');
      const label = manageLabels[deleteTarget.kind];
      setDeleteTarget(null);
      await refresh();
      showNotice(`${label}已删除`);
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : '无法删除事项');
    } finally {
      setDeleting(false);
    }
  };

  const deletingName = deleteTarget && data
    ? deleteTarget.kind === 'AREA' ? data.areas.find((item) => item.id === deleteTarget.id)?.name
      : deleteTarget.kind === 'GOAL' ? data.goals.find((item) => item.id === deleteTarget.id)?.title
        : deleteTarget.kind === 'PROJECT' ? data.projects.find((item) => item.id === deleteTarget.id)?.title
          : data.taskDefinitions.find((item) => item.id === deleteTarget.id)?.title
    : null;
  const deleteBlockedBy = deleteTarget && data
    ? deleteTarget.kind === 'AREA' ? data.goals.filter((item) => item.areaId === deleteTarget.id).length
      : deleteTarget.kind === 'GOAL' ? data.projects.filter((item) => item.goalId === deleteTarget.id).length + data.taskDefinitions.filter((item) => item.goalId === deleteTarget.id).length
        : deleteTarget.kind === 'PROJECT' ? data.taskDefinitions.filter((item) => item.projectId === deleteTarget.id).length
          : 0
    : 0;
  const activeGoals = data?.goals.filter((goal) => goal.status === 'ACTIVE') ?? [];
  const activeProjects = data?.projects.filter((project) => project.status === 'ACTIVE') ?? [];
  const instancesTask = data?.taskDefinitions.find((task) => task.id === instancesTaskId);
  const rescheduleOccurrence = data?.occurrences.find((item) => item.id === rescheduleOccurrenceId);
  const clearTargetOccurrence = actionTarget?.action === 'CLEAR' ? data?.occurrences.find((item) => item.id === actionTarget.id) : null;

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
    upcoming: ['近期任务', `查看未来 ${data?.upcomingDays ?? upcomingDays} 天有明确截止日期的普通任务。`],
    plan: ['总事项安排', '按领域、目标和项目检查完整计划。'],
  } as const;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 md:flex">
        <Brand />
        <nav className="mt-9 space-y-1" aria-label="主导航">
          {navItems.map((item) => (
            <NavButton key={item.id} item={item} active={activeView === item.id} onClick={() => navigateView(item.id)} />
          ))}
        </nav>

        <div className="mt-8 px-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">领域</p>
            <button
              type="button"
              className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              onClick={() => openNewStructure('AREA')}
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
              <button type="button" className="text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => openNewStructure('AREA')}>
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
              <Button variant="ghost" className="rounded-xl" onClick={() => setTrashOpen(true)} aria-label="打开回收站" title="回收站">
                <Trash2 className="size-4" /><span className="hidden sm:inline">回收站</span>
              </Button>
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
                    <DropdownMenuItem onClick={() => openNewStructure('AREA')}>
                      <Layers3 />领域
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!data?.areas.length} onClick={() => openNewStructure('GOAL')}>
                      <Target />目标
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!activeGoals.length} onClick={() => openNewStructure('PROJECT')}>
                      <FolderKanban />项目
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!activeGoals.length} onClick={() => openNewTask()}>
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
              <div className="hidden text-right sm:block lg:hidden">
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
            <TodayView data={data} loading={loading} derived={derived} onStatusChange={changeStatus} onClearOverdue={clearOverdue} onRescheduleOverdue={openRescheduleOverdue} onWeekComplete={openWeekCompleteAction} onWeekUndo={(id) => void changeWeekCompletion(id, false)} onEditTask={(id) => setEditTarget({ kind: 'TASK', id })} onDeleteTask={(id) => openDelete({ kind: 'TASK', id })} onCycleChange={openCycleAction} onGoToPlan={() => navigateView('plan')} onOpenUpcoming={() => navigateView('upcoming')} />
          ) : null}
          {activeView === 'upcoming' ? (
            <UpcomingView data={data} loading={loading} occurrences={derived.upcoming} upcomingDays={upcomingDays} onRangeChange={changeUpcomingRange} onStatusChange={changeStatus} onEditTask={(id) => setEditTarget({ kind: 'TASK', id })} onDeleteTask={(id) => openDelete({ kind: 'TASK', id })} onCycleChange={openCycleAction} />
          ) : null}
          {activeView === 'plan' ? (
            <PlanView
              data={data}
              loading={loading}
              undatedCount={(data?.goals.filter((goal) => !goal.ownDueDate).length ?? 0) + (data?.projects.filter((project) => !project.ownDueDate).length ?? 0) + derived.undated.length}
              onCreateArea={() => openNewStructure('AREA')}
              onCreateGoal={(areaId) => openNewStructure('GOAL', areaId)}
              onCreateProject={(goalId) => openNewStructure('PROJECT', goalId)}
              onCreateTask={(goalId, projectId) => openNewTask(goalId, projectId)}
              onEdit={setEditTarget}
              onDelete={openDelete}
              onCycleChange={openCycleAction}
              onWeekCompletionChange={(id, completed) => void changeWeekCompletion(id, completed)}
              onCompletionChange={openCompletionAction}
              onAbandonChange={openAbandonAction}
              onOpenInstances={setInstancesTaskId}
            />
          ) : null}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-background/94 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden" aria-label="移动端主导航">
        {navItems.map((item) => (
          <NavButton key={item.id} item={item} active={activeView === item.id} mobile onClick={() => navigateView(item.id)} />
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
              key={`${kind}-${newStructureRequest?.kind === kind ? newStructureRequest.sequence : 'closed'}-${data.areas.map((area) => area.id).join('-')}-${data.goals.map((goal) => goal.id).join('-')}`}
              kind={kind}
              open={newStructureRequest?.kind === kind}
              onOpenChange={(open) => { if (!open) setNewStructureRequest(null); }}
              areas={data.areas}
              goals={activeGoals}
              today={data.today}
              initialAreaId={kind === 'GOAL' ? newStructureRequest?.parentId : undefined}
              initialGoalId={kind === 'PROJECT' ? newStructureRequest?.parentId : undefined}
              onCreated={async () => {
                await refresh();
                showNotice(`${kind === 'AREA' ? '领域' : kind === 'GOAL' ? '目标' : '项目'}已创建`);
              }}
            />
          ))}
          <CreateTaskDialog
            key={`task-${newTaskRequest?.sequence ?? 'closed'}-${data.goals.map((goal) => goal.id).join('-')}-${data.projects.map((project) => project.id).join('-')}`}
            open={Boolean(newTaskRequest)}
            onOpenChange={(open) => { if (!open) setNewTaskRequest(null); }}
            goals={activeGoals}
            areas={data.areas}
            projects={activeProjects}
            today={data.today}
            initialGoalId={newTaskRequest?.goalId}
            initialProjectId={newTaskRequest?.projectId}
            onCreated={async () => {
              await refresh();
              showNotice('任务已创建');
            }}
          />
          {editTarget?.kind !== 'TASK' && editTarget ? (
            <CreateStructureDialog
              key={`edit-${editTarget.kind}-${editTarget.id}`}
              kind={editTarget.kind}
              open
              onOpenChange={(open) => { if (!open) setEditTarget(null); }}
              editing={editTarget.kind === 'AREA' ? data.areas.find((item) => item.id === editTarget.id) as AreaSummary
                : editTarget.kind === 'GOAL' ? data.goals.find((item) => item.id === editTarget.id) as GoalSummary
                  : data.projects.find((item) => item.id === editTarget.id) as ProjectSummary}
              areas={data.areas}
              goals={activeGoals}
              today={data.today}
              onCreated={async () => {
                setEditTarget(null);
                await refresh();
                showNotice(`${manageLabels[editTarget.kind]}已修改`);
              }}
            />
          ) : null}
          {editTarget?.kind === 'TASK' ? (
            <CreateTaskDialog
              key={`edit-task-${editTarget.id}`}
              open
              onOpenChange={(open) => { if (!open) setEditTarget(null); }}
              editing={data.taskDefinitions.find((item) => item.id === editTarget.id)}
              scheduleLocked={data.taskDefinitions.some((item) => item.id === editTarget.id && item.type === 'RECURRING')
                && data.occurrences.some((item) => item.taskId === editTarget.id && (item.scheduledDate <= data.today || item.status !== 'PENDING'))}
              goals={activeGoals}
              areas={data.areas}
              projects={activeProjects}
              today={data.today}
              onCreated={async () => {
                setEditTarget(null);
                await refresh();
                showNotice('任务已修改');
              }}
            />
          ) : null}
        </>
      ) : null}
      {data && instancesTask ? <TaskInstancesDialog
        key={instancesTask.id}
        task={instancesTask}
        occurrences={data.occurrences.filter((item) => item.taskId === instancesTask.id)}
        parentBlockedReason={parentBlockReason(data, instancesTask.goalId, instancesTask.projectId)}
        onClose={() => setInstancesTaskId(null)}
        onStatusChange={changeStatus}
        onClearOverdue={clearOverdue}
        onRescheduleOverdue={openRescheduleOverdue}
        onGoToPlan={() => { setInstancesTaskId(null); navigateView('plan'); }}
        today={data.today}
      /> : null}
      {data && rescheduleOccurrence ? <RescheduleOverdueDialog
        key={rescheduleOccurrence.id}
        occurrence={rescheduleOccurrence}
        today={data.today}
        parentBlockedReason={parentBlockReason(data, rescheduleOccurrence.goalId, rescheduleOccurrence.projectId)}
        onClose={() => setRescheduleOccurrenceId(null)}
        onSaved={async () => {
          setRescheduleOccurrenceId(null);
          await refresh();
          showNotice('截止日期已更新，任务仍待处理');
        }}
        onGoToPlan={() => { setRescheduleOccurrenceId(null); navigateView('plan'); }}
      /> : null}
      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} onRestored={async (kind) => {
        await refresh();
        showNotice(`${manageLabels[kind]}已恢复`);
      }} />
      <AlertDialog open={Boolean(actionTarget)} onOpenChange={(open) => { if (!open && !acting) setActionTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionTarget?.action === 'CLEAR' ? clearTargetOccurrence?.type === 'ONE_TIME' ? '删除逾期任务' : '删除本条循环逾期' : actionTarget?.action === 'WEEK_COMPLETE' ? '确认本周完成' : actionTarget?.action === 'STOP' ? '停止循环' : actionTarget?.action === 'RESUME' ? '恢复循环' : actionTarget?.action === 'COMPLETE' ? '确认完成' : actionTarget?.action === 'ABANDON' ? '放弃' : actionTarget?.action === 'RESTORE' ? '恢复' : '重新打开'}“{actionTarget?.title ?? ''}”？</AlertDialogTitle>
            <AlertDialogDescription>
              {actionTarget?.action === 'CLEAR' ? '清理后这条逾期不再显示。普通任务可从回收站恢复；循环任务的单次记录无法恢复。'
                : actionTarget?.action === 'WEEK_COMPLETE' ? '这会记为一次周级完成成果，本周剩余日期不再提醒；不会自动完成今天，也不会清理原有逾期。可在“已处理 · 本周循环”撤回。'
                : actionTarget?.action === 'STOP' ? '停止后不再生成未来实例；已发生、已完成和逾期的实例都会保留。尚未发生的待办会撤下。'
                : actionTarget?.action === 'RESUME' ? '恢复后将继续按原规则生成实例；请确认上层时间边界仍然合适。'
                  : actionTarget?.action === 'COMPLETE' ? '确认后项目或目标将标记为已完成，并锁定结构修改；需要时可以重新打开。'
                    : actionTarget?.action === 'ABANDON' ? '放弃后，所有未处理任务会取消，循环将停止；已完成的历史会保留。以后可恢复上层事项，但任务不会自动重新打开。'
                      : actionTarget?.action === 'RESTORE' ? '恢复后上层事项重新进入进行中；被取消的任务仍保持取消，需要逐项重新打开。'
                    : actionTarget?.kind === 'PROJECT' ? '重新打开项目后可以继续处理任务；若所属目标已完成，必须先手动重新打开目标。'
                        : '重新打开后可继续编辑或添加任务。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError ? <p className="text-sm text-destructive" role="alert">{actionError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={acting} onClick={() => void performAction()}>{acting ? '处理中…' : '确认'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除{deleteTarget ? manageLabels[deleteTarget.kind] : '事项'}“{deletingName ?? ''}”？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlockedBy
                ? `此事项还有 ${deleteBlockedBy} 个下级事项。请先删除或转移它们，才能删除当前事项。`
                : deleteTarget?.kind === 'TASK'
                  ? '删除后任务及其全部循环实例会从界面隐藏，包括已完成记录；之后可从回收站恢复。'
                  : '删除后此事项会从界面隐藏，之后可从回收站恢复。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p className="text-sm text-destructive" role="alert">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting || Boolean(deleteBlockedBy)} onClick={() => void deleteItem()}>
              {deleting ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  onClearOverdue,
  onRescheduleOverdue,
  onWeekComplete,
  onWeekUndo,
  onEditTask,
  onDeleteTask,
  onCycleChange,
  onGoToPlan,
  onOpenUpcoming,
}: {
  data: PlannerData | null;
  loading: boolean;
  derived: { overdue: PlannerOccurrence[]; today: PlannerOccurrence[]; completedToday: PlannerOccurrence[]; weeklyHandled: Array<{ task: TaskDefinitionSummary; occurrence?: PlannerOccurrence }>; otherHandled: PlannerOccurrence[]; upcoming: PlannerOccurrence[]; undated: TaskDefinitionSummary[] };
  onStatusChange: (id: string, status: TaskStatus) => void;
  onClearOverdue: (id: string) => void;
  onRescheduleOverdue: (id: string) => void;
  onWeekComplete: (id: string) => void;
  onWeekUndo: (id: string) => void;
  onEditTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onCycleChange: (id: string, running: boolean) => void;
  onGoToPlan: () => void;
  onOpenUpcoming: () => void;
}) {
  const [showOverdue, setShowOverdue] = useState(true);
  if (loading && !data) return <LoadingList />;
  if (!data) return null;

  return (
    <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0 space-y-8">
        {derived.overdue.length ? (
          <div className="overflow-hidden rounded-2xl border border-red-200/80 bg-card shadow-[0_2px_12px_rgba(127,29,29,.035)]">
            <button type="button" onClick={() => setShowOverdue((value) => !value)} className="flex w-full items-center gap-3 border-l-[3px] border-red-400 px-4 py-3.5 text-left transition-colors hover:bg-red-50/40 sm:px-5">
              <span className="grid size-9 place-items-center rounded-xl bg-red-50 text-red-600"><CircleAlert className="size-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-red-950">{derived.overdue.length} 项任务已逾期</span>
                <span className="mt-0.5 block truncate text-xs text-red-700/75">普通任务可改期；循环任务仅可删除本条逾期，超过 16 条自动清理最早记录</span>
              </span>
              <span className="flex items-center gap-1 text-sm font-medium text-red-700">{showOverdue ? '收起' : '查看'}<ChevronRight className={`size-4 transition-transform ${showOverdue ? 'rotate-90' : ''}`} /></span>
            </button>
            {showOverdue ? (
              <div className="divide-y divide-red-100 border-t border-red-100">
                {derived.overdue.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} onStatusChange={onStatusChange} onClearOverdue={onClearOverdue} onRescheduleOverdue={onRescheduleOverdue} onEditTask={canManageDefinition(data, occurrence) ? onEditTask : undefined} onDeleteTask={canManageDefinition(data, occurrence) ? onDeleteTask : undefined} onCycleChange={canManageDefinition(data, occurrence) ? onCycleChange : undefined} compact />)}
              </div>
            ) : null}
          </div>
        ) : null}

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">待处理</h2>
              <p className="mt-1 text-xs text-muted-foreground">勾选任务即完成今日安排</p>
            </div>
            <span className="pb-0.5 text-sm tabular-nums text-muted-foreground">{derived.today.length} 项</span>
          </div>
          {derived.today.length ? (
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_8px_30px_rgba(25,30,55,.035)]">
              {derived.today.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} todayMode="PENDING" onStatusChange={onStatusChange} onWeekComplete={occurrence.definitionStatus === 'ACTIVE' && !data.taskDefinitions.find((task) => task.id === occurrence.taskId)?.currentWeekCompleted ? onWeekComplete : undefined} onEditTask={canManageDefinition(data, occurrence) ? onEditTask : undefined} onDeleteTask={canManageDefinition(data, occurrence) ? onDeleteTask : undefined} onCycleChange={canManageDefinition(data, occurrence) ? onCycleChange : undefined} />)}
            </div>
          ) : (
            <Empty className="border border-dashed border-border bg-card py-10">
              <EmptyHeader><EmptyMedia variant="icon"><Check /></EmptyMedia><EmptyTitle>{derived.overdue.length ? '今天没有新到期任务' : '今天已经清空'}</EmptyTitle><EmptyDescription>{derived.overdue.length ? `还有 ${derived.overdue.length} 项逾期任务需要处理。` : '没有待处理的今日任务。'}</EmptyDescription></EmptyHeader>
            </Empty>
          )}
        </section>

        {derived.weeklyHandled.length || derived.otherHandled.length ? (
          <section className="space-y-3" aria-label="已处理任务">
            <div className="flex items-end justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">已处理</h2><span className="pb-0.5 text-sm tabular-nums text-muted-foreground">{derived.weeklyHandled.length + derived.otherHandled.length} 项</span></div>
            {derived.weeklyHandled.length ? <div className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-card">
              <h3 className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/55 px-4 py-3 text-sm font-semibold text-indigo-900 sm:px-5"><Repeat2 className="size-4" />本周循环 <span className="ml-auto text-xs font-normal text-indigo-700/75">{derived.weeklyHandled.length} 项</span></h3>
              <div className="divide-y divide-border/60">{derived.weeklyHandled.map(({ task, occurrence }) => {
                const goal = data.goals.find((item) => item.id === task.goalId);
                const project = data.projects.find((item) => item.id === task.projectId);
                const area = data.areas.find((item) => item.id === goal?.areaId);
                const parentReason = parentBlockReason(data, task.goalId, task.projectId);
                return <WeeklyHandledCard
                  key={task.id}
                  task={task}
                  occurrence={occurrence}
                  path={[area?.name, project?.title || goal?.title].filter(Boolean).join(' · ')}
                  areaColor={area?.color || DEFAULT_AREA_COLOR}
                  weekCompleteBlockedReason={task.definitionStatus !== 'ACTIVE' ? '请先恢复循环任务' : parentReason}
                  weekUndoBlockedReason={parentReason}
                  todayUndoBlockedReason={occurrence ? occurrenceUndoBlockReason(data, occurrence) : null}
                  onCompleteWeek={() => onWeekComplete(task.id)}
                  onUndoWeek={() => onWeekUndo(task.id)}
                  onUndoToday={() => { if (occurrence) onStatusChange(occurrence.id, 'PENDING'); }}
                  onGoToPlan={onGoToPlan}
                />;
              })}</div>
            </div> : null}
            {derived.otherHandled.length ? <details key={derived.otherHandled.map((occurrence) => occurrence.id).join(':')} open className="overflow-hidden rounded-2xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-slate-50 sm:px-5">其他已处理 · {derived.otherHandled.length} 项</summary>
              <div className="divide-y divide-border/60 border-t border-border/60">
                {derived.otherHandled.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} todayMode="HANDLED" undoBlockedReason={occurrenceUndoBlockReason(data, occurrence)} onGoToPlan={onGoToPlan} onStatusChange={onStatusChange} onEditTask={canManageDefinition(data, occurrence) ? onEditTask : undefined} onDeleteTask={canManageDefinition(data, occurrence) ? onDeleteTask : undefined} onCycleChange={canManageDefinition(data, occurrence) ? onCycleChange : undefined} compact />)}
              </div>
            </details> : null}
          </section>
        ) : null}
      </section>

      <RightRail data={data} todayCount={derived.today.length} completedCount={derived.completedToday.length} upcomingCount={derived.upcoming.length} onOpenUpcoming={onOpenUpcoming} />
    </div>
  );
}

function RightRail({ data, todayCount, completedCount, upcomingCount, onOpenUpcoming }: { data: PlannerData; todayCount: number; completedCount: number; upcomingCount: number; onOpenUpcoming: () => void }) {
  const total = todayCount + completedCount;
  const progress = total ? Math.round(completedCount / total * 100) : 0;
  const completedByDay = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(data.today, index - 6);
    return data.occurrences.filter((item) => item.status === 'COMPLETED' && item.completedAt && dateInTimeZone(item.completedAt, data.timeZone) === date).length;
  });
  const weekTotal = completedByDay.reduce((sum, count) => sum + count, 0);
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-28">
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_30px_rgba(25,30,55,.035)]">
          <div className="flex items-baseline justify-between gap-3"><h2 className="text-sm font-semibold">今日进度</h2><span className="text-sm font-semibold tabular-nums text-primary">{completedCount} / {total}</span></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`今日进度 ${progress}%`}><span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
          <div className="mt-7 flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold">近 7 天节奏</h3><span className="text-xs tabular-nums text-muted-foreground">共完成 {weekTotal} 项</span></div>
          <div className="mt-4 flex h-20 items-end justify-between gap-2" aria-label="近期完成趋势">
            {completedByDay.map((count, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <span className={`w-full max-w-6 rounded-t-md ${index === 6 ? 'bg-primary' : 'bg-primary/15'}`} style={{ height: `${count ? Math.min(52, count * 16) : 2}px` }} />
                <span className="text-[11px] text-muted-foreground">{index === 6 ? '今' : ['日', '一', '二', '三', '四', '五', '六'][parseDate(addDays(data.today, index - 6)).getUTCDay()]}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-border/70 pt-4">
            <p className="text-xs text-muted-foreground">接下来 {data.upcomingDays} 天</p>
            <div className="mt-1 flex items-center justify-between gap-2"><p className="text-sm font-medium">{upcomingCount} 项近期任务</p><button type="button" onClick={onOpenUpcoming} className="inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">查看<ChevronRight className="size-3.5" /></button></div>
          </div>
        </section>
      </div>
    </aside>
  );
}

function UpcomingView({ data, loading, occurrences, upcomingDays, onRangeChange, onStatusChange, onEditTask, onDeleteTask, onCycleChange }: { data: PlannerData | null; loading: boolean; occurrences: PlannerOccurrence[]; upcomingDays: number; onRangeChange: (days: number) => void; onStatusChange: (id: string, status: TaskStatus) => void; onEditTask: (id: string) => void; onDeleteTask: (id: string) => void; onCycleChange: (id: string, running: boolean) => void }) {
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
        <Empty className="border border-dashed border-border bg-card py-14"><EmptyHeader><EmptyMedia variant="icon"><CalendarRange /></EmptyMedia><EmptyTitle>近期没有任务</EmptyTitle><EmptyDescription>未来有明确截止日期的普通任务会显示在这里。</EmptyDescription></EmptyHeader></Empty>
      ) : null}
      <div className="space-y-8">
        {data ? grouped.map(([date, items]) => (
          <section key={date}>
            <div className="mb-3 flex items-center gap-3"><h2 className="font-semibold">{longDate(date)}</h2><span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">{items.length} 项</span></div>
            <div className="space-y-2.5">{items.map((occurrence) => <TaskRow key={occurrence.id} occurrence={occurrence} today={data.today} onStatusChange={onStatusChange} onEditTask={canManageDefinition(data, occurrence) ? onEditTask : undefined} onDeleteTask={canManageDefinition(data, occurrence) ? onDeleteTask : undefined} onCycleChange={canManageDefinition(data, occurrence) ? onCycleChange : undefined} />)}</div>
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
  onEdit,
  onDelete,
  onCycleChange,
  onWeekCompletionChange,
  onCompletionChange,
  onAbandonChange,
  onOpenInstances,
}: {
  data: PlannerData | null;
  loading: boolean;
  undatedCount: number;
  onCreateArea: () => void;
  onCreateGoal: (areaId: string) => void;
  onCreateProject: (goalId: string) => void;
  onCreateTask: (goalId: string, projectId?: string) => void;
  onEdit: (target: ManageTarget) => void;
  onDelete: (target: ManageTarget) => void;
  onCycleChange: (id: string, running: boolean) => void;
  onWeekCompletionChange: (id: string, completed: boolean) => void;
  onCompletionChange: (kind: 'GOAL' | 'PROJECT', id: string, completed: boolean) => void;
  onAbandonChange: (kind: 'GOAL' | 'PROJECT', id: string, abandoned: boolean) => void;
  onOpenInstances: (id: string) => void;
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

  const visibleTask = (task: TaskDefinitionSummary) => filter === 'all' || (task.type === 'ONE_TIME' ? !task.ownDueDate : !task.ownEndDate);

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setFilter('all')}><ListTree className="size-4" />全部事项</Button>
        <Button variant={filter === 'undated' ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setFilter('undated')}><CircleDashed className="size-4" />未安排结束日期 {undatedCount}</Button>
      </div>

      {filter === 'undated' && undatedCount === 0 ? (
        <Empty className="mb-5 border border-dashed border-border bg-card py-12"><EmptyHeader><EmptyMedia variant="icon"><Check /></EmptyMedia><EmptyTitle>都已安排结束日期</EmptyTitle><EmptyDescription>目标、项目和任务均已设置自己的时间边界。</EmptyDescription></EmptyHeader></Empty>
      ) : null}

      <div className="space-y-5">
        {data.areas.map((area) => {
          const areaGoals = data.goals.filter((goal) => goal.areaId === area.id);
          const hasUndatedItems = areaGoals.some((goal) => !goal.ownDueDate
            || data.projects.some((project) => project.goalId === goal.id && !project.ownDueDate)
            || data.taskDefinitions.some((task) => task.goalId === goal.id && visibleTask(task)));
          if (filter === 'undated' && !hasUndatedItems) return null;
          return (
            <section key={area.id} className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_8px_28px_rgba(15,23,42,.035)]">
              <header className="flex items-center gap-2 border-b border-l-[3px] border-border bg-muted/35 px-3 py-4 sm:gap-3 sm:px-5" style={{ borderLeftColor: area.color, backgroundColor: `color-mix(in srgb, ${area.color} 7%, var(--card))` }}>
                <span className="size-3 shrink-0 rounded-full" style={{ background: area.color }} />
                <h2 className="min-w-0 flex-1"><span className="block truncate font-bold">{area.name}</span><span className="block text-xs font-normal text-muted-foreground">{timeStatusLabel(area.startDate, area.ownDueDate, data.today, 'MONTH')}</span></h2>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{area.taskCount} 项任务</span>
                <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5" onClick={() => onCreateGoal(area.id)} aria-label={`在${area.name}下创建目标`}><Plus className="size-3.5" />目标</Button>
                <ManageMenu label={area.name} onEdit={() => onEdit({ kind: 'AREA', id: area.id })} onDelete={() => onDelete({ kind: 'AREA', id: area.id })} />
              </header>
              <div className="divide-y divide-border">
                {!areaGoals.length ? <p className="px-5 py-5 text-sm text-muted-foreground">暂无目标，点击上方“目标”开始规划。</p> : null}
                {areaGoals.map((goal) => {
                  const goalEnd = minDate(area.ownDueDate, goal.ownDueDate);
                  const directTasks = data.taskDefinitions.filter((task) => task.goalId === goal.id && !task.projectId && visibleTask(task));
                  const goalProjects = data.projects.filter((project) => project.goalId === goal.id);
                  const visibleProjects = filter === 'all'
                    ? goalProjects
                    : goalProjects.filter((project) => !project.ownDueDate || data.taskDefinitions.some((task) => task.projectId === project.id && visibleTask(task)));
                  if (filter === 'undated' && goal.ownDueDate && !directTasks.length && !visibleProjects.length) return null;
                  return (
                    <details key={goal.id} open className="group/goal relative">
                      <summary className="flex cursor-pointer list-none items-center gap-3 py-4 pl-5 pr-16 hover:bg-muted/25">
                        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Target className="size-[18px]" /></span>
                        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="min-w-0 truncate font-semibold">{goal.title}</span><LifecycleBadge status={goal.status} />{goal.status === 'ACTIVE' && goal.canComplete ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">待确认完成</span> : null}</span><span className="mt-0.5 block text-xs text-muted-foreground">{goal.ownDueDate ? `${shortDate(goal.ownDueDate)} 截止` : '未设置目标截止日期'}{goal.status === 'ACTIVE' ? ` · ${timeStatusLabel(goal.startDate, goalEnd, data.today, 'MONTH')}` : ''}</span></span>
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/goal:rotate-90" />
                      </summary>
                      <div className="absolute right-4 top-4"><ManageMenu label={goal.title} onEdit={goal.status === 'ACTIVE' ? () => onEdit({ kind: 'GOAL', id: goal.id }) : undefined} onDelete={() => onDelete({ kind: 'GOAL', id: goal.id })} actions={goal.status === 'COMPLETED' ? [{ label: '重新打开目标', icon: RotateCcw, onClick: () => onCompletionChange('GOAL', goal.id, false) }] : goal.status === 'ABANDONED' ? [{ label: '恢复目标', icon: RotateCcw, onClick: () => onAbandonChange('GOAL', goal.id, false) }] : [...(goal.canComplete ? [{ label: '确认完成目标', icon: Check, onClick: () => onCompletionChange('GOAL', goal.id, true) }] : []), { label: '放弃目标', icon: Ban, onClick: () => onAbandonChange('GOAL', goal.id, true) }]} /></div>
                      <div className="border-t border-border/70 bg-background/45 px-4 py-3 sm:pl-10">
                        {goal.status === 'COMPLETED' ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"><span className="text-sm text-emerald-900">目标已确认完成；如需撤回下级任务，请先手动重新打开目标。</span><Button size="sm" variant="outline" onClick={() => onCompletionChange('GOAL', goal.id, false)}>重新打开目标</Button></div> : null}
                        {goal.canComplete ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"><span className="text-sm font-medium text-emerald-900">目标的下级事项已处理，可以确认完成。</span><Button size="sm" onClick={() => onCompletionChange('GOAL', goal.id, true)}>确认完成目标</Button></div> : null}
                        {directTasks.length ? <div className="space-y-2 pb-3">{directTasks.map((task) => <PlanTaskRow key={task.id} task={task} today={data.today} endDate={task.type === 'RECURRING' ? minDate(task.ownEndDate, goalEnd) : task.ownDueDate} weekUndoBlockedReason={parentBlockReason(data, task.goalId, task.projectId)} onEdit={goal.status === 'ACTIVE' ? () => onEdit({ kind: 'TASK', id: task.id }) : undefined} onDelete={goal.status === 'ACTIVE' ? () => onDelete({ kind: 'TASK', id: task.id }) : undefined} onCycleChange={goal.status === 'ACTIVE' ? onCycleChange : undefined} onWeekCompletionChange={onWeekCompletionChange} onViewInstances={() => onOpenInstances(task.id)} />)}</div> : null}
                        <div className="space-y-3">
                          {visibleProjects.map((project) => {
                            const projectEnd = minDate(goalEnd, project.ownDueDate);
                            const projectTasks = data.taskDefinitions.filter((task) => task.projectId === project.id && visibleTask(task));
                            return (
                              <details key={project.id} open className="group/project relative rounded-2xl border border-border bg-card">
                                <summary className="flex cursor-pointer list-none items-center gap-3 py-3.5 pl-4 pr-14">
                                  <FolderKanban className="size-[18px] text-primary" />
                                  <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="min-w-0 truncate text-sm font-semibold">{project.title}</span><LifecycleBadge status={project.status} />{project.status === 'ACTIVE' && project.canComplete ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">待确认完成</span> : null}</span><span className="mt-0.5 block text-xs text-muted-foreground">{project.ownDueDate ? `${shortDate(project.ownDueDate)} 截止` : '跟随目标时间边界'}{project.status === 'ACTIVE' ? ` · ${timeStatusLabel(project.startDate, projectEnd, data.today, 'WEEK')}` : ''}</span></span>
                                  <Badge variant="secondary" className="rounded-full">{projectTasks.length}</Badge>
                                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/project:rotate-90" />
                                </summary>
                                <div className="absolute right-3 top-3"><ManageMenu label={project.title} onEdit={project.status === 'ACTIVE' && goal.status === 'ACTIVE' ? () => onEdit({ kind: 'PROJECT', id: project.id }) : undefined} onDelete={() => onDelete({ kind: 'PROJECT', id: project.id })} actions={goal.status !== 'ACTIVE' ? [] : project.status === 'COMPLETED' ? [{ label: '重新打开项目', icon: RotateCcw, onClick: () => onCompletionChange('PROJECT', project.id, false) }] : project.status === 'ABANDONED' ? [{ label: '恢复项目', icon: RotateCcw, onClick: () => onAbandonChange('PROJECT', project.id, false) }] : [...(project.canComplete ? [{ label: '确认完成项目', icon: Check, onClick: () => onCompletionChange('PROJECT', project.id, true) }] : []), { label: '放弃项目', icon: Ban, onClick: () => onAbandonChange('PROJECT', project.id, true) }]} /></div>
                                <div className="space-y-2 border-t border-border p-3">
                                  {project.status === 'COMPLETED' ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"><span className="text-sm text-emerald-900">{goal.status === 'ACTIVE' ? '项目已确认完成；撤回任务前请先重新打开项目。' : '所属目标已完成，请先手动重新打开目标，再重新打开项目。'}</span>{goal.status === 'ACTIVE' ? <Button size="sm" variant="outline" onClick={() => onCompletionChange('PROJECT', project.id, false)}>重新打开项目</Button> : null}</div> : null}
                                  {project.canComplete ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"><span className="text-sm font-medium text-emerald-900">项目任务已处理，可以确认完成。</span><Button size="sm" onClick={() => onCompletionChange('PROJECT', project.id, true)}>确认完成项目</Button></div> : null}
                                  {projectTasks.map((task) => <PlanTaskRow key={task.id} task={task} today={data.today} endDate={task.type === 'RECURRING' ? minDate(task.ownEndDate, projectEnd) : task.ownDueDate} weekUndoBlockedReason={parentBlockReason(data, task.goalId, task.projectId)} onEdit={project.status === 'ACTIVE' && goal.status === 'ACTIVE' ? () => onEdit({ kind: 'TASK', id: task.id }) : undefined} onDelete={project.status === 'ACTIVE' && goal.status === 'ACTIVE' ? () => onDelete({ kind: 'TASK', id: task.id }) : undefined} onCycleChange={project.status === 'ACTIVE' && goal.status === 'ACTIVE' ? onCycleChange : undefined} onWeekCompletionChange={onWeekCompletionChange} onViewInstances={() => onOpenInstances(task.id)} />)}
                                  {project.status === 'ACTIVE' && goal.status === 'ACTIVE' ? <Button variant="outline" size="sm" className="rounded-lg" onClick={() => onCreateTask(goal.id, project.id)}><Plus className="size-3.5" />添加任务</Button> : null}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                        {goal.status === 'ACTIVE' ? <div className="mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3"><Button variant="outline" size="sm" className="rounded-lg" onClick={() => onCreateProject(goal.id)}><Plus className="size-3.5" />添加项目</Button><Button variant="outline" size="sm" className="rounded-lg" onClick={() => onCreateTask(goal.id)}><Plus className="size-3.5" />添加任务</Button></div> : null}
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

function LifecycleBadge({ status }: { status: GoalSummary['status'] }) {
  const tone = status === 'ACTIVE' ? 'bg-sky-100 text-sky-800' : status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700';
  const label = status === 'ACTIVE' ? '进行中' : status === 'COMPLETED' ? '已完成' : '已放弃';
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
}

function PlanTaskRow({ task, today, endDate, weekUndoBlockedReason, onEdit, onDelete, onCycleChange, onWeekCompletionChange, onViewInstances }: { task: TaskDefinitionSummary; today: string; endDate: string | null; weekUndoBlockedReason?: string | null; onEdit?: () => void; onDelete?: () => void; onCycleChange?: (id: string, running: boolean) => void; onWeekCompletionChange: (id: string, completed: boolean) => void; onViewInstances: () => void }) {
  const recurrenceLabel = task.type === 'RECURRING'
    ? task.frequency === 'WEEKLY'
      ? task.interval === 1 ? '每周' : `每 ${task.interval} 周`
      : task.interval === 1 ? '每天' : `每 ${task.interval} 天`
    : null;
  const timeStatus: TimeStatus = task.type === 'RECURRING'
    ? task.definitionStatus === 'CANCELLED' ? 'CYCLE_CANCELLED' : task.definitionStatus
    : task.pendingCount ? 'ACTIVE' : task.completedCount ? 'COMPLETED' : task.cancelledCount ? 'CANCELLED' : 'ACTIVE';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-3">
      <span className={`grid size-7 place-items-center rounded-lg ${task.type === 'RECURRING' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
        {task.type === 'RECURRING' ? <Repeat2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{task.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{recurrenceLabel ?? (task.ownDueDate ? `${shortDate(task.ownDueDate)} 截止` : '未安排截止日期')} · {timeStatusLabel(task.startDate, endDate, today, 'WEEK', timeStatus)}{task.currentWeekCompleted ? ' · 本周已完成' : ''}{task.currentWeekCompleted && weekUndoBlockedReason ? ` · ${weekUndoBlockedReason}` : ''}{task.autoDeletedOverdueCount ? ` · 已自动清理 ${task.autoDeletedOverdueCount} 条旧逾期` : ''}</span></span>
      <span className="hidden text-xs text-muted-foreground sm:inline">{task.pendingCount ? `${task.pendingCount} 待处理` : task.type === 'RECURRING' && task.definitionStatus === 'ACTIVE' ? '循环中' : task.completedCount ? '已完成' : '已取消'}</span>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onViewInstances}>{task.pendingCount ? '处理' : '记录'}</Button>
      <ManageMenu label={task.title} onEdit={onEdit} onDelete={onDelete} actions={[
        ...(task.frequency === 'WEEKLY' && task.currentWeekCompleted && !weekUndoBlockedReason ? [{ label: '撤销本周完成', icon: RotateCcw, onClick: () => onWeekCompletionChange(task.id, false) }] : []),
        ...(task.type === 'RECURRING' && onCycleChange ? [{ label: task.definitionStatus !== 'ACTIVE' ? '恢复循环' : '停止循环', icon: task.definitionStatus !== 'ACTIVE' ? PlayCircle : PauseCircle, onClick: () => onCycleChange(task.id, task.definitionStatus !== 'ACTIVE') }] : []),
      ]} />
    </div>
  );
}

function ManageMenu({ label, onEdit, onDelete, actions = [] }: { label: string; onEdit?: () => void; onDelete?: () => void; actions?: Array<{ label: string; icon: typeof Check; onClick: () => void }> }) {
  if (!onEdit && !onDelete && !actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}更多操作`}
        title={`${label}更多操作`}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {onEdit ? <DropdownMenuItem onClick={onEdit}><Pencil />编辑</DropdownMenuItem> : null}
        {actions.map((action) => {
          const Icon = action.icon;
          return <DropdownMenuItem key={action.label} onClick={action.onClick}><Icon />{action.label}</DropdownMenuItem>;
        })}
        {onDelete ? <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />删除</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LoadingList() {
  return <div className="space-y-3"><TaskRowSkeleton /><TaskRowSkeleton /><TaskRowSkeleton /></div>;
}
