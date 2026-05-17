CREATE TABLE `upstream_failure_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`upstream_id` text,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`match` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upstream_failure_rules_upstream_id_idx` ON `upstream_failure_rules` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `upstream_failure_rules_enabled_idx` ON `upstream_failure_rules` (`enabled`);--> statement-breakpoint
CREATE INDEX `upstream_failure_rules_priority_idx` ON `upstream_failure_rules` (`priority`);--> statement-breakpoint
ALTER TABLE `upstreams` ADD `failure_rule_config` text;
