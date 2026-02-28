CREATE TABLE `api_key_upstreams` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`upstream_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_key_upstreams_api_key_id_idx` ON `api_key_upstreams` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `api_key_upstreams_upstream_id_idx` ON `api_key_upstreams` (`upstream_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_api_key_upstream` ON `api_key_upstreams` (`api_key_id`,`upstream_id`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`key_value_encrypted` text,
	`key_prefix` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`user_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_key_hash_idx` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_is_active_idx` ON `api_keys` (`is_active`);--> statement-breakpoint
CREATE TABLE `billing_manual_price_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`input_price_per_million` real NOT NULL,
	`output_price_per_million` real NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_manual_price_overrides_model_unique` ON `billing_manual_price_overrides` (`model`);--> statement-breakpoint
CREATE INDEX `billing_manual_price_overrides_model_idx` ON `billing_manual_price_overrides` (`model`);--> statement-breakpoint
CREATE TABLE `billing_model_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`input_price_per_million` real NOT NULL,
	`output_price_per_million` real NOT NULL,
	`source` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`synced_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billing_model_prices_model_idx` ON `billing_model_prices` (`model`);--> statement-breakpoint
CREATE INDEX `billing_model_prices_source_idx` ON `billing_model_prices` (`source`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_model_prices_model_source` ON `billing_model_prices` (`model`,`source`);--> statement-breakpoint
CREATE TABLE `billing_price_sync_history` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`source` text,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`failure_reason` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billing_price_sync_history_created_at_idx` ON `billing_price_sync_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `circuit_breaker_states` (
	`id` text PRIMARY KEY NOT NULL,
	`upstream_id` text NOT NULL,
	`state` text DEFAULT 'closed' NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`last_failure_at` integer,
	`opened_at` integer,
	`last_probe_at` integer,
	`config` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `circuit_breaker_states_upstream_id_unique` ON `circuit_breaker_states` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `circuit_breaker_states_upstream_id_idx` ON `circuit_breaker_states` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `circuit_breaker_states_state_idx` ON `circuit_breaker_states` (`state`);--> statement-breakpoint
CREATE TABLE `compensation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`capabilities` text NOT NULL,
	`target_header` text NOT NULL,
	`sources` text NOT NULL,
	`mode` text DEFAULT 'missing_only' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compensation_rules_name_unique` ON `compensation_rules` (`name`);--> statement-breakpoint
CREATE INDEX `compensation_rules_enabled_idx` ON `compensation_rules` (`enabled`);--> statement-breakpoint
CREATE TABLE `request_billing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`request_log_id` text NOT NULL,
	`api_key_id` text,
	`upstream_id` text,
	`model` text,
	`billing_status` text NOT NULL,
	`unbillable_reason` text,
	`price_source` text,
	`base_input_price_per_million` real,
	`base_output_price_per_million` real,
	`input_multiplier` real,
	`output_multiplier` real,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`final_cost` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`billed_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`request_log_id`) REFERENCES `request_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_billing_snapshots_request_log_id_unique` ON `request_billing_snapshots` (`request_log_id`);--> statement-breakpoint
CREATE INDEX `request_billing_snapshots_request_log_id_idx` ON `request_billing_snapshots` (`request_log_id`);--> statement-breakpoint
CREATE INDEX `request_billing_snapshots_billing_status_idx` ON `request_billing_snapshots` (`billing_status`);--> statement-breakpoint
CREATE INDEX `request_billing_snapshots_model_idx` ON `request_billing_snapshots` (`model`);--> statement-breakpoint
CREATE INDEX `request_billing_snapshots_created_at_idx` ON `request_billing_snapshots` (`created_at`);--> statement-breakpoint
CREATE TABLE `request_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text,
	`upstream_id` text,
	`method` text,
	`path` text,
	`model` text,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`status_code` integer,
	`duration_ms` integer,
	`routing_duration_ms` integer,
	`error_message` text,
	`routing_type` text,
	`group_name` text,
	`lb_strategy` text,
	`priority_tier` integer,
	`failover_attempts` integer DEFAULT 0 NOT NULL,
	`failover_history` text,
	`routing_decision` text,
	`session_id` text,
	`affinity_hit` integer DEFAULT false NOT NULL,
	`affinity_migrated` integer DEFAULT false NOT NULL,
	`ttft_ms` integer,
	`is_stream` integer DEFAULT false NOT NULL,
	`session_id_compensated` integer DEFAULT false NOT NULL,
	`header_diff` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `request_logs_api_key_id_idx` ON `request_logs` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `request_logs_upstream_id_idx` ON `request_logs` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `request_logs_created_at_idx` ON `request_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `request_logs_routing_type_idx` ON `request_logs` (`routing_type`);--> statement-breakpoint
CREATE TABLE `upstream_health` (
	`id` text PRIMARY KEY NOT NULL,
	`upstream_id` text NOT NULL,
	`is_healthy` integer DEFAULT true NOT NULL,
	`last_check_at` integer,
	`last_success_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`error_message` text,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upstream_health_upstream_id_unique` ON `upstream_health` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `upstream_health_upstream_id_idx` ON `upstream_health` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `upstream_health_is_healthy_idx` ON `upstream_health` (`is_healthy`);--> statement-breakpoint
CREATE TABLE `upstreams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`timeout` integer DEFAULT 60 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`config` text,
	`weight` integer DEFAULT 1 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`route_capabilities` text,
	`allowed_models` text,
	`model_redirects` text,
	`affinity_migration` text,
	`billing_input_multiplier` real DEFAULT 1 NOT NULL,
	`billing_output_multiplier` real DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upstreams_name_unique` ON `upstreams` (`name`);--> statement-breakpoint
CREATE INDEX `upstreams_name_idx` ON `upstreams` (`name`);--> statement-breakpoint
CREATE INDEX `upstreams_is_active_idx` ON `upstreams` (`is_active`);--> statement-breakpoint
CREATE INDEX `upstreams_priority_idx` ON `upstreams` (`priority`);
