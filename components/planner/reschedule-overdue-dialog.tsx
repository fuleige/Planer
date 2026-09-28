'use client';

import { useState, type SyntheticEvent } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { minDate } from '@/lib/date';
import type { PlannerOccurrence } from '@/lib/planner-types';

export function RescheduleOverdueDialog({ occurrence, today, parentBlockedReason, onClose, onSaved, onGoToPlan }: {
  occurrence: PlannerOccurrence;
  today: string;
  parentBlockedReason: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onGoToPlan: () => void;
}) {
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const latestEnd = minDate(occurrence.areaDueDate, occurrence.goalDueDate, occurrence.projectDueDate);
  const boundaryExpired = Boolean(latestEnd && latestEnd < today);
  const dateValid = Boolean(dueDate && dueDate >= today && (!latestEnd || dueDate <= latestEnd));

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dateValid || parentBlockedReason || boundaryExpired || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/occurrences/${occurrence.id}/reschedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dueDate }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '无法重设截止日期');
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法重设截止日期');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarClock className="size-5" /></div>
          <DialogTitle>重设“{occurrence.title}”的截止日期</DialogTitle>
          <DialogDescription>改期后任务仍是待处理，原逾期会从列表移出；不会补记完成或跳过。</DialogDescription>
        </DialogHeader>
        <form id="reschedule-overdue-form" className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <Label htmlFor="reschedule-overdue-date">新截止日期</Label>
            <Input id="reschedule-overdue-date" type="date" value={dueDate} min={today} max={latestEnd ?? undefined} onChange={(event) => setDueDate(event.target.value)} disabled={Boolean(parentBlockedReason) || boundaryExpired || saving} required />
            <p className="text-xs text-muted-foreground">可设为今天或以后；不能超过上层事项的截止日期。</p>
          </div>
          {parentBlockedReason || boundaryExpired ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{parentBlockedReason || '上层截止日期已过，请先调整上层事项。'} <button type="button" onClick={onGoToPlan} className="font-semibold underline underline-offset-2">前往总事项</button></p> : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" form="reschedule-overdue-form" disabled={!dateValid || Boolean(parentBlockedReason) || boundaryExpired || saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}保存新截止日期</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
