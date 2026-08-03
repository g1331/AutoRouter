ALTER TABLE "billing_model_prices" ADD COLUMN "priority_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "billing_model_prices" ADD COLUMN "priority_output_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "billing_model_prices" ADD COLUMN "priority_cache_read_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "billing_model_prices" ADD COLUMN "priority_cache_write_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "requested_service_tier" varchar(16);--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "effective_service_tier" varchar(16);--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "requested_service_tier" varchar(16);--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "effective_service_tier" varchar(16);
