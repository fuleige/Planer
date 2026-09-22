'use client';

import { useEffect } from 'react';
import type { PlannerData } from '@/lib/planner-types';

export function PlannerWebMcpTools({
  data,
  onRefresh,
  onNotice,
}: {
  data: PlannerData;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const register = async () => {
      await context.registerTool(
        {
          name: 'list_today_tasks',
          title: '查看今日任务',
          description: '读取当前未完成的今日任务和逾期任务，不修改任何数据。',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute() {
            return data.occurrences
              .filter((item) => {
                if (item.status !== 'PENDING') return false;
                const overdue = Boolean(item.dueDate && item.dueDate < data.today);
                const today = item.type === 'RECURRING'
                  ? item.scheduledDate === data.today
                  : item.dueDate === data.today;
                return overdue || today;
              })
              .map((item) => ({
                occurrenceId: item.id,
                title: item.title,
                dueDate: item.dueDate,
                area: item.areaName,
                goal: item.goalTitle,
                project: item.projectTitle,
                recurring: item.type === 'RECURRING',
              }));
          },
        },
        { signal: lifecycle.signal },
      );

      await context.registerTool(
        {
          name: 'complete_task_occurrence',
          title: '完成任务',
          description: '将一个明确的任务实例标记为已完成，并刷新当前规划界面。',
          inputSchema: {
            type: 'object',
            properties: {
              occurrenceId: {
                type: 'string',
                description: '由 list_today_tasks 返回的任务实例 ID。',
              },
            },
            required: ['occurrenceId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const occurrenceId = (input as { occurrenceId?: unknown })?.occurrenceId;
            if (typeof occurrenceId !== 'string' || !occurrenceId) {
              throw new Error('occurrenceId 必须是非空字符串');
            }
            const occurrence = data.occurrences.find((item) => item.id === occurrenceId);
            if (!occurrence) throw new Error('未找到对应任务实例');
            if (occurrence.status === 'CANCELLED') throw new Error('已取消的任务需要先重新打开');

            const response = await fetch(`/api/occurrences/${occurrenceId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ status: 'COMPLETED' }),
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(result.error || '无法完成任务');
            await onRefresh();
            onNotice('任务已完成');
            return { occurrenceId, status: 'COMPLETED', title: occurrence.title };
          },
        },
        { signal: lifecycle.signal },
      );
    };

    void register().catch((error) => console.warn('WebMCP tools unavailable', error));
    return () => lifecycle.abort();
  }, [data, onNotice, onRefresh]);

  return null;
}
