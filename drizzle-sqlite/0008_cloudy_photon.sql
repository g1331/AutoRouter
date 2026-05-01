CREATE TABLE `upstream_probe_results` (
	`id` text PRIMARY KEY NOT NULL,
	`upstream_id` text NOT NULL,
	`route_capability` text NOT NULL,
	`client_profile` text NOT NULL,
	`probe_template_id` text NOT NULL,
	`probe_kind` text NOT NULL,
	`status` text NOT NULL,
	`layer` text NOT NULL,
	`success` integer DEFAULT false NOT NULL,
	`latency_ms` integer,
	`first_byte_latency_ms` integer,
	`completed_latency_ms` integer,
	`status_code` integer,
	`error_type` text,
	`error_message` text,
	`probe_url` text,
	`model` text,
	`checked_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upstream_probe_results_upstream_id_idx` ON `upstream_probe_results` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `upstream_probe_results_status_idx` ON `upstream_probe_results` (`status`);--> statement-breakpoint
CREATE INDEX `upstream_probe_results_checked_at_idx` ON `upstream_probe_results` (`checked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `upstream_probe_results_identity_unique` ON `upstream_probe_results` (`upstream_id`,`route_capability`,`client_profile`,`probe_template_id`);
