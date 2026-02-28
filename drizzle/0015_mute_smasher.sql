ALTER TABLE "billing_manual_price_overrides" ADD COLUMN "cache_read_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "billing_manual_price_overrides" ADD COLUMN "cache_write_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "billing_model_prices" ADD COLUMN "cache_read_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "billing_model_prices" ADD COLUMN "cache_write_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "base_cache_read_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "base_cache_write_input_price_per_million" double precision;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "cache_read_cost" double precision;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "cache_write_cost" double precision;
