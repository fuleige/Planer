'use client';

import { Ban, Check, Repeat2, RotateCcw } from 'lucide-react';
import { CompactAction } from '@/components/planner/compact-action';
import type { PlannerOccurrence, TaskDefinitionSummary } from '@/lib/planner-types';

export function WeeklyHandledCard({ task, occurrence, path, areaColor, weekCompleteBlockedReason, weekUndoBlockedReason, todayUndoBlockedReason, onCompleteWeek, onUndoWeek, onUndoToday, onGoToPlan }: {
  task: TaskDefinitionSummary;
  occurrence?: PlannerOccurrence;
  path: string;
  areaColor: string;
  weekCompleteBlockedReason?: string | null;
  weekUndoBlockedReason?: string | null;
  todayUndoBlockedReason?: string | null;
  onCompleteWeek: () => void;
  onUndoWeek: () => void;
  onUndoToday: () => void;
  onGoToPlan: () => void;
}) {
  const weekCompleted = task.currentWeekCompleted;
  const completedToday = occurrence?.status === 'COMPLETED';
  const skippedToday = occurrence?.status === 'CANCELLED';
  const blockedReason = (weekCompleted ? weekUndoBlockedReason : weekCompleteBlockedReason) || todayUndoBlockedReason;
  const needsParentAction = Boolean(blockedReason && (blockedReason.includes('目标') || blockedReason.includes('项目')));

  return (
    <article className="bg-card px-4 py-4 transition-colors hover:bg-slate-50/70 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><Repeat2 className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-6">{task.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs leading-5 text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: areaColor }} aria-hidden="true" />{path}</span><span>{task.interval === 1 ? '每周循环' : `每 ${task.interval} 周`}</span></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {completedToday ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-800">今日已完成</span> : null}
            {skippedToday ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">今日已跳过</span> : null}
            {weekCompleted ? <span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-800">本周已完成</span> : null}
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-0.5 pl-8">
        {weekCompleted ? (
          <CompactAction icon={RotateCcw} tone="indigo" disabled={Boolean(weekUndoBlockedReason)} onClick={onUndoWeek}>撤回本周完成</CompactAction>
        ) : (
          <CompactAction icon={Check} tone="indigo" disabled={Boolean(weekCompleteBlockedReason)} onClick={onCompleteWeek}>本周完成</CompactAction>
        )}
        {occurrence ? <CompactAction icon={RotateCcw} disabled={Boolean(todayUndoBlockedReason)} onClick={onUndoToday}>撤回今日操作</CompactAction> : null}
      </div>
      {blockedReason ? <p className="mt-2 pl-10 text-xs text-amber-800"><Ban className="mr-1 inline size-3.5" />{blockedReason}{needsParentAction ? <button type="button" onClick={onGoToPlan} className="ml-1 font-semibold underline underline-offset-2">前往总事项</button> : null}</p> : null}
    </article>
  );
}
