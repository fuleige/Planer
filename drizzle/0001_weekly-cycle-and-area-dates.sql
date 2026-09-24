CREATE TABLE `recurrence_week_completions` (
	`task_id` text NOT NULL,
	`week_start` text NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recurrence_week_completions` ON `recurrence_week_completions` (`task_id`,`week_start`);--> statement-breakpoint
ALTER TABLE `areas` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `areas` ADD `own_due_date` text;--> statement-breakpoint
ALTER TABLE `recurrence_rules` ADD `auto_deleted_overdue_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `areas` SET `start_date` = COALESCE(
  (SELECT MIN(`start_date`) FROM `goals` WHERE `area_id` = `areas`.`id` AND `deleted_at` IS NULL),
  date('now', '+8 hours')
);--> statement-breakpoint
INSERT OR IGNORE INTO `recurrence_week_completions` (`task_id`, `week_start`, `completed_at`)
SELECT o.`task_id`, date(o.`scheduled_date`, '-' || ((CAST(strftime('%w', o.`scheduled_date`) AS INTEGER) + 6) % 7) || ' days'), COALESCE(o.`completed_at`, o.`updated_at`)
FROM `task_occurrences` o
JOIN `recurrence_rules` rr ON rr.`task_id` = o.`task_id`
WHERE rr.`frequency` = 'WEEKLY' AND o.`status` = 'COMPLETED';--> statement-breakpoint
UPDATE `task_occurrences` SET `due_date` = `scheduled_date`
WHERE `status` = 'PENDING' AND `task_id` IN (
  SELECT `task_id` FROM `recurrence_rules` WHERE `frequency` = 'WEEKLY'
);--> statement-breakpoint
DELETE FROM `task_occurrences` WHERE `status` = 'PENDING'
  AND `scheduled_date` > date('now', '+8 hours')
  AND `task_id` IN (SELECT `task_id` FROM `recurrence_rules`);--> statement-breakpoint
UPDATE `recurrence_rules` SET `generated_through_date` = date(
  (SELECT `start_date` FROM `task_definitions` WHERE `id` = `recurrence_rules`.`task_id`), '-1 day'
);
