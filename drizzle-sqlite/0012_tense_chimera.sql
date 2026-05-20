CREATE TABLE `cliproxy_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mode` text DEFAULT 'managed' NOT NULL,
	`base_url` text NOT NULL,
	`management_url` text NOT NULL,
	`client_api_key_encrypted` text NOT NULL,
	`management_key_encrypted` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cliproxy_instances_name_unique` ON `cliproxy_instances` (`name`);--> statement-breakpoint
CREATE INDEX `cliproxy_instances_name_idx` ON `cliproxy_instances` (`name`);--> statement-breakpoint
CREATE INDEX `cliproxy_instances_enabled_idx` ON `cliproxy_instances` (`enabled`);
