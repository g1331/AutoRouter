CREATE TABLE "billing_tier_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" varchar(255) NOT NULL,
	"source" varchar(32) NOT NULL,
	"threshold_input_tokens" integer NOT NULL,
	"display_label" varchar(255),
	"input_price_per_million" double precision NOT NULL,
	"output_price_per_million" double precision NOT NULL,
	"cache_read_input_price_per_million" double precision,
	"cache_write_input_price_per_million" double precision,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_tier_rules_model_source_threshold" UNIQUE("model","source","threshold_input_tokens")
);
--> statement-breakpoint
ALTER TABLE "billing_model_prices" ADD COLUMN "max_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "billing_model_prices" ADD COLUMN "max_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "matched_rule_type" varchar(16);--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "matched_rule_display_label" varchar(255);--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "applied_tier_threshold" integer;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "model_max_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "model_max_output_tokens" integer;--> statement-breakpoint
CREATE INDEX "billing_tier_rules_model_idx" ON "billing_tier_rules" USING btree ("model");--> statement-breakpoint
CREATE INDEX "billing_tier_rules_source_idx" ON "billing_tier_rules" USING btree ("source");
