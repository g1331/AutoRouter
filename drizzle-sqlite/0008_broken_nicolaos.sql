CREATE TABLE `cliproxyapi_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mode` text DEFAULT 'external' NOT NULL,
	`base_url` text NOT NULL,
	`client_api_key_encrypted` text,
	`management_url` text NOT NULL,
	`management_secret_encrypted` text,
	`outbound_proxy_url` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`last_tested_at` integer,
	`last_status` text,
	`last_error` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cliproxyapi_connections_name_unique` ON `cliproxyapi_connections` (`name`);--> statement-breakpoint
CREATE INDEX `cliproxyapi_connections_name_idx` ON `cliproxyapi_connections` (`name`);--> statement-breakpoint
CREATE INDEX `cliproxyapi_connections_is_default_idx` ON `cliproxyapi_connections` (`is_default`);--> statement-breakpoint
CREATE INDEX `cliproxyapi_connections_is_enabled_idx` ON `cliproxyapi_connections` (`is_enabled`);
