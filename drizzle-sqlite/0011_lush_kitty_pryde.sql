CREATE TABLE `traffic_recording_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`mode` text DEFAULT 'failure' NOT NULL,
	`redact_sensitive` integer DEFAULT true NOT NULL,
	`retention_days` integer DEFAULT 7 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `traffic_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`request_log_id` text,
	`api_key_id` text,
	`upstream_id` text,
	`method` text,
	`path` text,
	`model` text,
	`status_code` integer,
	`outcome` text NOT NULL,
	`fixture_path` text NOT NULL,
	`fixture_size_bytes` integer DEFAULT 0 NOT NULL,
	`request_size_bytes` integer DEFAULT 0 NOT NULL,
	`response_size_bytes` integer DEFAULT 0 NOT NULL,
	`redacted` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`request_log_id`) REFERENCES `request_logs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `traffic_recordings_fixture_path_unique` ON `traffic_recordings` (`fixture_path`);--> statement-breakpoint
CREATE INDEX `traffic_recordings_request_log_id_idx` ON `traffic_recordings` (`request_log_id`);--> statement-breakpoint
CREATE INDEX `traffic_recordings_api_key_id_idx` ON `traffic_recordings` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `traffic_recordings_upstream_id_idx` ON `traffic_recordings` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `traffic_recordings_status_code_idx` ON `traffic_recordings` (`status_code`);--> statement-breakpoint
CREATE INDEX `traffic_recordings_model_idx` ON `traffic_recordings` (`model`);--> statement-breakpoint
CREATE INDEX `traffic_recordings_created_at_idx` ON `traffic_recordings` (`created_at`);
