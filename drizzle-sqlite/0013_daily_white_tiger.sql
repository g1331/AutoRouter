CREATE TABLE `cliproxy_auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`auth_file_name` text NOT NULL,
	`provider` text NOT NULL,
	`email` text,
	`status` text,
	`disabled` integer DEFAULT false NOT NULL,
	`prefix` text,
	`model_count` integer DEFAULT 0 NOT NULL,
	`priority` integer,
	`note` text,
	`raw_metadata` text,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `cliproxy_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cliproxy_auth_accounts_instance_id_idx` ON `cliproxy_auth_accounts` (`instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cliproxy_auth_accounts_instance_file_unique` ON `cliproxy_auth_accounts` (`instance_id`,`auth_file_name`);
