ALTER TABLE `request_logs` ADD `api_key_name` text;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `api_key_prefix` text;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `model_discovery` text;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `model_catalog` text;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `model_catalog_updated_at` integer;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `model_catalog_last_status` text;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `model_catalog_last_error` text;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `model_rules` text;
