CREATE TABLE `user_upstreams` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`upstream_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_upstreams_user_id_idx` ON `user_upstreams` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_upstreams_upstream_id_idx` ON `user_upstreams` (`upstream_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_upstream` ON `user_upstreams` (`user_id`,`upstream_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
ALTER TABLE `request_billing_snapshots` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `request_billing_snapshots_user_id_idx` ON `request_billing_snapshots` (`user_id`);--> statement-breakpoint
ALTER TABLE `request_logs` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `request_logs_user_id_idx` ON `request_logs` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`key_value_encrypted` text,
	`key_prefix` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`user_id` text,
	`access_mode` text DEFAULT 'unrestricted' NOT NULL,
	`allowed_models` text,
	`spending_rules` text,
	`is_active` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "key_hash", "key_value_encrypted", "key_prefix", "name", "description", "user_id", "access_mode", "allowed_models", "spending_rules", "is_active", "expires_at", "created_at", "updated_at") SELECT "id", "key_hash", "key_value_encrypted", "key_prefix", "name", "description", "user_id", "access_mode", "allowed_models", "spending_rules", "is_active", "expires_at", "created_at", "updated_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_key_hash_idx` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_is_active_idx` ON `api_keys` (`is_active`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);
