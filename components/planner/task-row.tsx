'use client';

import { Ban, MoreHorizontal, Repeat2, RotateCcw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PlannerOccurrence, TaskStatus } from '@/lib/planner-types';

type Props = {
  occurrence: PlannerOccurrence;
  today: string;
  onStatusChange: (id: string, status: TaskStatus) => void;
  compact?: boolean;
};

function shortDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  );
}

function taskMeta(occurrence: PlannerOccurrence, today: string) {
  if (occurrence.type === 'RECURRING') {
    if (occurrence.frequency === 'WEEKLY') return occurrence.interval === 1 ? '每周循环' : `每 ${occurrence.interval} 周`;
    return occurrence.interval === 1 ? '每日循环' : `每 ${occurrence.interval} 天`;
  }
  if (!occurrence.dueDate) return '未安排截止日期';
  if (occurrence.dueDate === today) return '今天截止';
  if (occurrence.dueDate < today) return `已逾期 · ${shortDate(occurrence.dueDate)}`;
  return `${shortDate(occurrence.dueDate)} 截止`;
}

export function TaskRow({ occurrence, today, onStatusChange, compact = false }: Props) {
  const completed = occurrence.status === 'COMPLETED';
  const cancelled = occurrence.status === 'CANCELLED';
  const path = occurrence.projectTitle
    ? `${occurrence.areaName} · ${occurrence.projectTitle}`
    : `${occurrence.areaName} · ${occurrence.goalTitle}`;

  return (
    <article
      className={`group flex items-start gap-3 rounded-2xl border border-border bg-card ${compact ? 'p-3.5' : 'p-4 sm:p-5'} shadow-[0_1px_2px_rgba(15,23,42,.025)] transition-all hover:border-primary/20 hover:shadow-[0_12px_28px_rgba(15,23,42,.05)]`}
    >
      <Checkbox
        checked={completed}
        disabled={cancelled}
        onCheckedChange={() => onStatusChange(occurrence.id, completed ? 'PENDING' : 'COMPLETED')}
        aria-label={`${completed ? '重新打开' : '完成'}${occurrence.title}`}
        className="mt-0.5 size-5 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-[15px] font-semibold ${completed || cancelled ? 'text-muted-foreground line-through' : ''}`}>
            {occurrence.title}
          </h3>
          {occurrence.type === 'RECURRING' ? (
            <Repeat2 className="size-3.5 text-muted-foreground" aria-label="循环任务" />
          ) : null}
          {cancelled ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">已取消</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{path}</span>
          <span>{taskMeta(occurrence, today)}</span>
        </div>
      </div>
      <span className="mt-2 size-2 rounded-full" style={{ background: occurrence.areaColor }} aria-hidden="true" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          aria-label={`${occurrence.title}更多操作`}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          {occurrence.status === 'PENDING' ? (
            <DropdownMenuItem variant="destructive" onClick={() => onStatusChange(occurrence.id, 'CANCELLED')}>
              <Ban />取消本次
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => onStatusChange(occurrence.id, 'PENDING')}>
              <RotateCcw />重新打开
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
