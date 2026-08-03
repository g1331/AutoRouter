ALTER TABLE `billing_model_prices` ADD `priority_input_price_per_million` real;--> statement-breakpoint
ALTER TABLE `billing_model_prices` ADD `priority_output_price_per_million` real;--> statement-breakpoint
ALTER TABLE `billing_model_prices` ADD `priority_cache_read_input_price_per_million` real;--> statement-breakpoint
ALTER TABLE `billing_model_prices` ADD `priority_cache_write_input_price_per_million` real;--> statement-breakpoint
ALTER TABLE `request_billing_snapshots` ADD `requested_service_tier` text;--> statement-breakpoint
ALTER TABLE `request_billing_snapshots` ADD `effective_service_tier` text;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `requested_service_tier` text;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `effective_service_tier` text;
