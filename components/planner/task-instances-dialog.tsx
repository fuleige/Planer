'use client';

import { useState } from 'react';
import { Ban, Check, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { weekStart } from '@/lib/date';
import type { PlannerOccurrence, TaskDefinitionSummary, TaskStatus } from '@/lib/planner-types';

export function TaskInstancesDialog({ task, occurrences, parentBlockedReason, today, onClose, onStatusChange, onClearOverdue, onGoToPlan }: {
  task: TaskDefinitionSummary;
  occurrences: PlannerOccurrence[];
  parentBlockedReason: string | null;
  today: string;
  onClose: () => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<{ ok: boolean; error?: string }>;
  onClearOverdue: (id: string) => void;
  onGoToPlan: () => void;
}) {
  const [filter, setFilter] = useState<'PENDING' | 'HANDLED'>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const items = occurrences
    .filter((item) => filter === 'PENDING' ? item.status === 'PENDING' : item.status !== 'PENDING')
    .sort((left, right) => filter === 'PENDING'
      ? left.scheduledDate.localeCompare(right.scheduledDate)
      : right.scheduledDate.localeCompare(left.scheduledDate));
  const pendingCount = occurrences.filter((item) => item.status === 'PENDING').length;
  const handledCount = occurrences.length - pendingCount;

  const change = async (id: string, status: TaskStatus) => {
    setBusyId(id);
    setError('');
    try {
      const result = await onStatusChange(id, status);
      if (result.error) setError(result.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>{task.type === 'RECURRING' ? '逐次处理循环任务；停止循环不会自动完成或取消已有实例。' : '在这里完成、取消或重新打开这项任务。'}</DialogDescription>
        </DialogHeader>
        {parentBlockedReason ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{parentBlockedReason}，再处理任务。<button type="button" onClick={onGoToPlan} className="font-semibold underline underline-offset-2">前往总事项</button></p> : null}
        <div className="flex gap-2">
          <Button size="sm" variant={filter === 'PENDING' ? 'default' : 'outline'} onClick={() => setFilter('PENDING')}>待处理 {pendingCount}</Button>
          <Button size="sm" variant={filter === 'HANDLED' ? 'default' : 'outline'} onClick={() => setFilter('HANDLED')}>已处理 {handledCount}</Button>
        </div>
        <div className="max-h-[58dvh] space-y-2 overflow-y-auto">
          {items.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{filter === 'PENDING' ? '没有待处理实例' : '还没有已处理实例'}</p> : null}
          {items.map((item) => {
            const weekUndoBlocked = task.currentWeekCompleted && task.frequency === 'WEEKLY' && weekStart(item.scheduledDate) === weekStart(today);
            return (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.scheduledDate}{item.dueDate && item.dueDate !== item.scheduledDate ? ` — ${item.dueDate}` : ''}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.status === 'PENDING' ? item.dueDate && item.dueDate < today ? '已逾期 · 仅可清理' : item.dueDate ? '待处理' : '无截止日期 · 待处理' : item.status === 'COMPLETED' ? '已完成' : '已取消'}</p>
              </div>
              {busyId === item.id ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : item.status === 'PENDING' && item.dueDate && item.dueDate < today ? (
                <Button size="sm" variant="destructive" onClick={() => { onClose(); onClearOverdue(item.id); }}><Trash2 className="size-4" />清理逾期</Button>
              ) : item.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <Button size="sm" disabled={Boolean(busyId) || Boolean(parentBlockedReason)} onClick={() => void change(item.id, 'COMPLETED')}><Check className="size-4" />完成</Button>
                  <Button size="sm" variant="outline" disabled={Boolean(busyId) || Boolean(parentBlockedReason)} onClick={() => void change(item.id, 'CANCELLED')}><Ban className="size-4" />{task.type === 'RECURRING' ? '今日跳过' : '取消任务'}</Button>
                </div>
              ) : (
                item.dueDate && item.dueDate < today ? null : <div className="flex flex-col items-end gap-1"><Button size="sm" variant="outline" disabled={Boolean(busyId) || Boolean(parentBlockedReason) || weekUndoBlocked} onClick={() => void change(item.id, 'PENDING')}><RotateCcw className="size-4" />撤回操作</Button>{weekUndoBlocked ? <span className="text-xs text-amber-800">请先撤回本周完成</span> : null}</div>
              )}
            </div>
          ); })}
        </div>
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
