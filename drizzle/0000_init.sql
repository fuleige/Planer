CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`own_due_date` text,
	`duration_value` real,
	`duration_days` integer,
	`display_unit` text DEFAULT 'MONTH' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`completed_at` text,
	`abandoned_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_goals_area` ON `goals` (`area_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`own_due_date` text,
	`duration_value` real,
	`duration_days` integer,
	`display_unit` text DEFAULT 'DAY' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`completed_at` text,
	`abandoned_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_projects_goal` ON `projects` (`goal_id`);--> statement-breakpoint
CREATE TABLE `recurrence_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`frequency` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`weekdays` text,
	`own_end_date` text,
	`generated_through_date` text,
	`series_status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recurrence_rules_task` ON `recurrence_rules` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`own_due_date` text,
	`duration_value` real,
	`duration_days` integer,
	`display_unit` text DEFAULT 'DAY' NOT NULL,
	`definition_status` text DEFAULT 'ACTIVE' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_task_definitions_goal` ON `task_definitions` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_task_definitions_project` ON `task_definitions` (`project_id`);--> statement-breakpoint
CREATE TABLE `task_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`completed_at` text,
	`cancelled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_task_occurrences_task_date` ON `task_occurrences` (`task_id`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `idx_task_occurrences_status_due` ON `task_occurrences` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_task_occurrences_scheduled` ON `task_occurrences` (`scheduled_date`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`upcoming_days` integer DEFAULT 14 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
