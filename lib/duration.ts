import { differenceInDays } from '@/lib/date';

export type TimeStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED' | 'CANCELLED' | 'CYCLE_CANCELLED' | 'STOPPED';

function formatDuration(days: number, maxUnit: 'MONTH' | 'WEEK') {
  let remaining = days;
  const parts: string[] = [];
  if (maxUnit === 'MONTH') {
    const months = Math.floor(remaining / 30);
    if (months) parts.push(`${months}月`);
    remaining %= 30;
  }
  const weeks = Math.floor(remaining / 7);
  if (weeks) parts.push(`${weeks}周`);
  remaining %= 7;
  if (remaining || !parts.length) parts.push(`${remaining}天`);
  return parts.join('');
}

export function timeStatusLabel(
  startDate: string,
  endDate: string | null | undefined,
  today: string,
  maxUnit: 'MONTH' | 'WEEK',
  status: TimeStatus = 'ACTIVE',
) {
  if (status === 'COMPLETED') return '已完成';
  if (status === 'ABANDONED') return '已放弃';
  if (status === 'CANCELLED') return '已取消';
  if (status === 'CYCLE_CANCELLED') return '已取消循环';
  if (status === 'STOPPED') return '已停止循环';

  if (!endDate) {
    return startDate > today ? '尚未开始' : `已持续 ${differenceInDays(today, startDate) + 1} 天`;
  }
  if (today < startDate) {
    return `总时间：${formatDuration(differenceInDays(endDate, startDate) + 1, maxUnit)}`;
  }
  if (today > endDate) return `已逾期 ${differenceInDays(today, endDate)} 天`;
  if (today === endDate) return '今天截止';
  return `剩余 ${formatDuration(differenceInDays(endDate, today) + 1, maxUnit)}`;
}
