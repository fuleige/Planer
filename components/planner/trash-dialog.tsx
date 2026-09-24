'use client';

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { DeletedItem } from '@/lib/planner';

const labels: Record<DeletedItem['kind'], string> = {
  AREA: '领域', GOAL: '目标', PROJECT: '项目', TASK: '任务',
};

export function TrashDialog({ open, onOpenChange, onRestored }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: (kind: DeletedItem['kind']) => Promise<void>;
}) {
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setError('');
      return fetch('/api/trash', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as { items?: DeletedItem[]; error?: string };
        if (!response.ok) throw new Error(result.error || '无法读取回收站');
        if (active) setItems(result.items ?? []);
      })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : '无法读取回收站'); })
      .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [open]);

  const restore = async (item: DeletedItem) => {
    setRestoringId(item.id);
    setError('');
    try {
      const response = await fetch(`/api/trash/${item.kind}/${item.id}`, { method: 'POST' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '无法恢复事项');
      setItems((current) => current.filter((entry) => !(entry.kind === item.kind && entry.id === item.id)));
      await onRestored(item.kind);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法恢复事项');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Trash2 className="size-5" /></div>
          <DialogTitle>回收站</DialogTitle>
          <DialogDescription>删除的事项仍保存在数据库。若上级也已删除，请先恢复上级；恢复循环任务可能补齐停用期间的实例。</DialogDescription>
        </DialogHeader>
        {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在读取…</p> : null}
        {!loading && !items.length && !error ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">回收站是空的</p> : null}
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
          {items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{labels[item.kind]} · 删除于 {item.deletedAt.slice(0, 10)}</p>
              </div>
              <Button variant="outline" size="sm" disabled={Boolean(restoringId)} onClick={() => void restore(item)}>
                {restoringId === item.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                恢复
              </Button>
            </div>
          ))}
        </div>
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
