CREATE TABLE `background_sync_task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_name` text NOT NULL,
	`trigger_type` text NOT NULL,
	`status` text NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`error_summary` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `background_sync_task_runs_task_name_idx` ON `background_sync_task_runs` (`task_name`);--> statement-breakpoint
CREATE INDEX `background_sync_task_runs_started_at_idx` ON `background_sync_task_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `background_sync_task_runs_status_idx` ON `background_sync_task_runs` (`status`);--> statement-breakpoint
CREATE TABLE `background_sync_tasks` (
	`task_name` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`interval_seconds` integer NOT NULL,
	`startup_delay_seconds` integer DEFAULT 0 NOT NULL,
	`last_started_at` integer,
	`last_finished_at` integer,
	`last_success_at` integer,
	`last_failed_at` integer,
	`last_status` text,
	`last_error` text,
	`last_duration_ms` integer,
	`last_success_count` integer DEFAULT 0 NOT NULL,
	`last_failure_count` integer DEFAULT 0 NOT NULL,
	`next_run_at` integer,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `background_sync_tasks_enabled_idx` ON `background_sync_tasks` (`enabled`);--> statement-breakpoint
CREATE INDEX `background_sync_tasks_next_run_at_idx` ON `background_sync_tasks` (`next_run_at`);
