-- 演示数据只通过显式种子命令写入数据库；应用运行时不会自动创建这些记录。
-- 中国时区全年为 UTC+8，因此使用 +8 hours 生成相对“今天”的演示日期。

INSERT OR IGNORE INTO areas (id, name, color, start_date, sort_order, created_at, updated_at) VALUES
  ('area-work', '工作', '#6366B8', date('now', '+8 hours', '-14 days'), 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('area-health', '健康', '#10b981', date('now', '+8 hours', '-30 days'), 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('area-growth', '成长', '#f59e0b', date('now', '+8 hours', '-20 days'), 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO goals (
  id, area_id, title, start_date, own_due_date, duration_value, duration_days,
  display_unit, status, sort_order, created_at, updated_at
) VALUES
  ('goal-planner', 'area-work', '完成事项规划系统第一版', date('now', '+8 hours', '-14 days'), date('now', '+8 hours', '+30 days'), 1.5, 45, 'MONTH', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('goal-running', 'area-health', '完成半程马拉松', date('now', '+8 hours', '-30 days'), date('now', '+8 hours', '+90 days'), 4.03, 121, 'MONTH', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('goal-reading', 'area-growth', '建立稳定阅读习惯', date('now', '+8 hours', '-20 days'), NULL, NULL, NULL, 'MONTH', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO projects (
  id, goal_id, title, start_date, own_due_date, duration_value, duration_days,
  display_unit, status, sort_order, created_at, updated_at
) VALUES
  ('project-v1', 'goal-planner', '第一版产品实现', date('now', '+8 hours', '-7 days'), date('now', '+8 hours', '+14 days'), 3.14, 22, 'WEEK', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('project-training', 'goal-running', '基础训练阶段', date('now', '+8 hours', '-21 days'), date('now', '+8 hours', '+60 days'), 11.71, 82, 'WEEK', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO task_definitions (
  id, goal_id, project_id, type, title, start_date, own_due_date,
  duration_value, duration_days, display_unit, definition_status,
  sort_order, created_at, updated_at
) VALUES
  ('task-requirements', 'goal-planner', 'project-v1', 'ONE_TIME', '整理第一版产品需求', date('now', '+8 hours', '-3 days'), date('now', '+8 hours'), 4, 4, 'DAY', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('task-data-model', 'goal-planner', 'project-v1', 'ONE_TIME', '完成数据模型草案', date('now', '+8 hours', '-6 days'), date('now', '+8 hours', '-2 days'), 5, 5, 'DAY', 'ACTIVE', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('task-undated', 'goal-planner', 'project-v1', 'ONE_TIME', '整理后续版本想法', date('now', '+8 hours'), NULL, NULL, NULL, 'DAY', 'ACTIVE', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('task-upcoming-1', 'goal-planner', 'project-v1', 'ONE_TIME', '完成移动端导航交互', date('now', '+8 hours', '+2 days'), date('now', '+8 hours', '+3 days'), 2, 2, 'DAY', 'ACTIVE', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('task-upcoming-2', 'goal-planner', 'project-v1', 'ONE_TIME', '验证循环任务边界', date('now', '+8 hours', '+5 days'), date('now', '+8 hours', '+7 days'), 3, 3, 'DAY', 'ACTIVE', 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('task-upcoming-3', 'goal-planner', 'project-v1', 'ONE_TIME', '整理第一轮体验反馈', date('now', '+8 hours', '+11 days'), date('now', '+8 hours', '+12 days'), 2, 2, 'DAY', 'ACTIVE', 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('task-strength', 'goal-running', 'project-training', 'RECURRING', '完成 30 分钟力量训练', date('now', '+8 hours', '-7 days'), NULL, 1, 1, 'DAY', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('task-reading', 'goal-reading', NULL, 'RECURRING', '阅读并记录今日笔记', date('now', '+8 hours'), NULL, 1, 1, 'DAY', 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO task_occurrences (
  id, task_id, scheduled_date, due_date, status, created_at, updated_at
) VALUES
  ('occ-task-requirements-demo', 'task-requirements', date('now', '+8 hours', '-3 days'), date('now', '+8 hours'), 'PENDING', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('occ-task-data-model-demo', 'task-data-model', date('now', '+8 hours', '-6 days'), date('now', '+8 hours', '-2 days'), 'PENDING', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('occ-task-undated-demo', 'task-undated', date('now', '+8 hours'), NULL, 'PENDING', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('occ-task-upcoming-1-demo', 'task-upcoming-1', date('now', '+8 hours', '+2 days'), date('now', '+8 hours', '+3 days'), 'PENDING', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('occ-task-upcoming-2-demo', 'task-upcoming-2', date('now', '+8 hours', '+5 days'), date('now', '+8 hours', '+7 days'), 'PENDING', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('occ-task-upcoming-3-demo', 'task-upcoming-3', date('now', '+8 hours', '+11 days'), date('now', '+8 hours', '+12 days'), 'PENDING', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO recurrence_rules (
  id, task_id, frequency, interval, weekdays, generated_through_date,
  series_status, created_at, updated_at
) VALUES
  ('rule-task-strength', 'task-strength', 'DAILY', 7, NULL, date('now', '+8 hours', '-8 days'), 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('rule-task-reading', 'task-reading', 'DAILY', 3, NULL, date('now', '+8 hours', '-1 day'), 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO user_preferences (
  id, timezone, upcoming_days, created_at, updated_at
) VALUES (
  'default', 'Asia/Shanghai', 14,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
