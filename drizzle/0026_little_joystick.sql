ALTER TABLE "upstreams" ADD COLUMN "model_discovery" json;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "model_catalog" json;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "model_catalog_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "model_catalog_last_status" varchar(16);--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "model_catalog_last_error" text;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "model_rules" json;
