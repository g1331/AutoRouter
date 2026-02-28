CREATE TABLE "billing_manual_price_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" varchar(255) NOT NULL,
	"input_price_per_million" double precision NOT NULL,
	"output_price_per_million" double precision NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_manual_price_overrides_model_unique" UNIQUE("model")
);
--> statement-breakpoint
CREATE TABLE "billing_model_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" varchar(255) NOT NULL,
	"input_price_per_million" double precision NOT NULL,
	"output_price_per_million" double precision NOT NULL,
	"source" varchar(32) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_model_prices_model_source" UNIQUE("model","source")
);
--> statement-breakpoint
CREATE TABLE "billing_price_sync_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(16) NOT NULL,
	"source" varchar(32),
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_billing_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_log_id" uuid NOT NULL,
	"api_key_id" uuid,
	"upstream_id" uuid,
	"model" varchar(255),
	"billing_status" varchar(16) NOT NULL,
	"unbillable_reason" varchar(64),
	"price_source" varchar(32),
	"base_input_price_per_million" double precision,
	"base_output_price_per_million" double precision,
	"input_multiplier" double precision,
	"output_multiplier" double precision,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"final_cost" double precision,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"billed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_billing_snapshots_request_log_id_unique" UNIQUE("request_log_id")
);
--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "billing_input_multiplier" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "billing_output_multiplier" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD CONSTRAINT "request_billing_snapshots_request_log_id_request_logs_id_fk" FOREIGN KEY ("request_log_id") REFERENCES "public"."request_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD CONSTRAINT "request_billing_snapshots_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD CONSTRAINT "request_billing_snapshots_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_manual_price_overrides_model_idx" ON "billing_manual_price_overrides" USING btree ("model");--> statement-breakpoint
CREATE INDEX "billing_model_prices_model_idx" ON "billing_model_prices" USING btree ("model");--> statement-breakpoint
CREATE INDEX "billing_model_prices_source_idx" ON "billing_model_prices" USING btree ("source");--> statement-breakpoint
CREATE INDEX "billing_price_sync_history_created_at_idx" ON "billing_price_sync_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "request_billing_snapshots_request_log_id_idx" ON "request_billing_snapshots" USING btree ("request_log_id");--> statement-breakpoint
CREATE INDEX "request_billing_snapshots_billing_status_idx" ON "request_billing_snapshots" USING btree ("billing_status");--> statement-breakpoint
CREATE INDEX "request_billing_snapshots_model_idx" ON "request_billing_snapshots" USING btree ("model");--> statement-breakpoint
CREATE INDEX "request_billing_snapshots_created_at_idx" ON "request_billing_snapshots" USING btree ("created_at");
