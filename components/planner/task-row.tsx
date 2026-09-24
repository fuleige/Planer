'use client';

import { Ban, MoreHorizontal, PauseCircle, Pencil, PlayCircle, Repeat2, RotateCcw, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { CompactAction } from '@/components/planner/compact-action';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PlannerOccurrence, TaskStatus } from '@/lib/planner-types';
import { minDate } from '@/lib/date';
import { timeStatusLabel } from '@/lib/duration';

type Props = {
  occurrence: PlannerOccurrence;
  today: string;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onEditTask?: (id: string) => void;
  onDeleteTask?: (id: string) => void;
  onCycleChange?: (id: string, running: boolean) => void;
  onClearOverdue?: (id: string) => void;
  onWeekComplete?: (id: string) => void;
  todayMode?: 'PENDING' | 'HANDLED';
  undoBlockedReason?: string | null;
  onGoToPlan?: () => void;
  compact?: boolean;
};

function shortDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  );
}

function taskMeta(occurrence: PlannerOccurrence, today: string) {
  if (occurrence.type === 'RECURRING') {
    const rule = occurrence.frequency === 'WEEKLY'
      ? occurrence.interval === 1 ? '每周循环' : `每 ${occurrence.interval} 周`
      : occurrence.interval === 1 ? '每日循环' : `每 ${occurrence.interval} 天`;
    return occurrence.definitionStatus === 'CANCELLED' ? `${rule} · 已取消循环` : occurrence.definitionStatus === 'STOPPED' ? `${rule} · 已停止` : rule;
  }
  if (!occurrence.dueDate) return '未安排截止日期';
  if (occurrence.dueDate === today) return '今天截止';
  if (occurrence.dueDate < today) return `已逾期 · ${shortDate(occurrence.dueDate)}`;
  return `${shortDate(occurrence.dueDate)} 截止`;
}

export function TaskRow({ occurrence, today, onStatusChange, onEditTask, onDeleteTask, onCycleChange, onClearOverdue, onWeekComplete, todayMode, undoBlockedReason, onGoToPlan, compact = false }: Props) {
  const completed = occurrence.status === 'COMPLETED';
  const cancelled = occurrence.status === 'CANCELLED';
  const overdue = occurrence.status === 'PENDING' && Boolean(occurrence.dueDate && occurrence.dueDate < today);
  const todayListRow = Boolean(todayMode || (overdue && onClearOverdue));
  const hasMenu = Boolean(onEditTask || onDeleteTask || onCycleChange || (overdue && onClearOverdue) || (!todayMode && !overdue));
  const path = occurrence.projectTitle
    ? `${occurrence.areaName} · ${occurrence.projectTitle}`
    : `${occurrence.areaName} · ${occurrence.goalTitle}`;
  const scheduleLabel = taskMeta(occurrence, today);
  const timeLabel = timeStatusLabel(occurrence.taskStartDate, occurrence.type === 'RECURRING' ? minDate(occurrence.recurrenceEndDate, occurrence.areaDueDate, occurrence.goalDueDate, occurrence.projectDueDate) : occurrence.taskOwnDueDate, today, 'WEEK', occurrence.status === 'PENDING' ? 'ACTIVE' : occurrence.status);

  return (
    <article
      className={todayListRow
        ? `group bg-card px-4 transition-colors hover:bg-slate-50/70 sm:px-5 ${compact ? 'py-3.5' : 'py-4 sm:py-5'}`
        : `group rounded-2xl border border-border bg-card ${compact ? 'p-3.5' : 'p-4 sm:p-5'} shadow-[0_1px_2px_rgba(15,23,42,.025)] transition-all hover:border-primary/20 hover:shadow-[0_12px_28px_rgba(15,23,42,.05)]`}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        {todayMode === 'HANDLED' ? completed ? <Checkbox checked disabled aria-label={`${occurrence.title}今日已完成`} className="mt-0.5 size-5 rounded-full" /> : <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-amber-300 text-amber-700" aria-label={`${occurrence.title}今日已跳过`}><Ban className="size-3" /></span> : !overdue ? <Checkbox
          checked={completed}
          disabled={cancelled}
          onCheckedChange={() => onStatusChange(occurrence.id, completed ? 'PENDING' : 'COMPLETED')}
          aria-label={`${todayMode === 'PENDING' ? '今日完成' : completed ? '重新打开' : '完成'}${occurrence.title}`}
          className={todayMode === 'PENDING' ? 'mt-0.5 size-6 rounded-[7px] border-[1.5px] border-slate-300 bg-white hover:border-primary' : 'mt-0.5 size-5 rounded-full'}
        /> : <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-red-300 text-xs text-red-600" aria-label="逾期">!</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`${todayMode === 'PENDING' ? 'text-[15px] leading-6 sm:text-base' : 'text-[15px]'} font-semibold ${completed || cancelled ? 'text-muted-foreground line-through' : ''}`}>
              {occurrence.title}
            </h3>
            {occurrence.type === 'RECURRING' ? <Repeat2 className="size-3.5 text-indigo-500" aria-label="循环任务" /> : null}
            {todayMode === 'HANDLED' ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{completed ? '今日已完成' : occurrence.type === 'RECURRING' ? '今日已跳过' : '已取消'}</span> : cancelled ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">已取消</span> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs leading-5 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 shrink-0 rounded-full" style={{ background: occurrence.areaColor }} aria-hidden="true" />{path}</span>
            <span className="hidden text-border sm:inline" aria-hidden="true">/</span>
            <span>{scheduleLabel}</span>
            {todayMode !== 'HANDLED' && timeLabel !== scheduleLabel ? <span className={todayMode === 'PENDING' ? 'font-medium text-foreground/75' : ''}>{timeLabel}</span> : null}
          </div>
        </div>
        {hasMenu ? <DropdownMenu>
          <DropdownMenuTrigger
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${occurrence.title}更多操作`}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            {overdue ? (
              onClearOverdue ? <DropdownMenuItem variant="destructive" onClick={() => onClearOverdue(occurrence.id)}><Trash2 />清理逾期</DropdownMenuItem> : null
            ) : (
              <>
                {onEditTask ? <DropdownMenuItem onClick={() => onEditTask(occurrence.taskId)}><Pencil />编辑任务</DropdownMenuItem> : null}
                {onCycleChange && occurrence.type === 'RECURRING' ? (
                  <DropdownMenuItem onClick={() => onCycleChange(occurrence.taskId, occurrence.definitionStatus !== 'ACTIVE')}>
                    {occurrence.definitionStatus !== 'ACTIVE' ? <PlayCircle /> : <PauseCircle />}
                    {occurrence.definitionStatus !== 'ACTIVE' ? '恢复循环' : '停止循环'}
                  </DropdownMenuItem>
                ) : null}
                {onDeleteTask ? <DropdownMenuItem variant="destructive" onClick={() => onDeleteTask(occurrence.taskId)}><Trash2 />删除任务</DropdownMenuItem> : null}
                {!todayMode && (occurrence.status === 'PENDING' ? (
                  <DropdownMenuItem onClick={() => onStatusChange(occurrence.id, 'CANCELLED')}>
                    <Ban />{occurrence.type === 'RECURRING' ? '今日跳过' : '取消任务'}
                  </DropdownMenuItem>
                ) : occurrence.dueDate && occurrence.dueDate < today ? null : (
                  <DropdownMenuItem onClick={() => onStatusChange(occurrence.id, 'PENDING')}><RotateCcw />重新打开</DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu> : null}
      </div>
      {todayMode === 'PENDING' ? <div className="mt-1 flex flex-wrap items-center gap-0.5 pl-7 sm:pl-8">
        <CompactAction icon={Ban} onClick={() => onStatusChange(occurrence.id, 'CANCELLED')}>{occurrence.type === 'RECURRING' ? '今日跳过' : '取消任务'}</CompactAction>
        {occurrence.frequency === 'WEEKLY' && onWeekComplete ? <CompactAction icon={Repeat2} tone="indigo" onClick={() => onWeekComplete(occurrence.taskId)}>本周完成</CompactAction> : null}
      </div> : null}
      {todayMode === 'HANDLED' ? <div className="mt-1 flex flex-wrap items-center gap-1 pl-6">
        <CompactAction icon={RotateCcw} disabled={Boolean(undoBlockedReason)} onClick={() => onStatusChange(occurrence.id, 'PENDING')}>撤回今日操作</CompactAction>
        {undoBlockedReason ? <span className="text-xs text-amber-800">{undoBlockedReason}{onGoToPlan && (undoBlockedReason.includes('目标') || undoBlockedReason.includes('项目')) ? <button type="button" className="ml-1 font-semibold underline underline-offset-2" onClick={onGoToPlan}>前往总事项</button> : null}</span> : null}
      </div> : null}
    </article>
  );
}

export function TaskRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
      <span className="size-5 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <span className="block h-4 w-2/3 animate-pulse rounded bg-muted" />
        <span className="block h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
