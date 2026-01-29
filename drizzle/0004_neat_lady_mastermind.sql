ALTER TABLE "upstreams" ADD COLUMN "provider_type" varchar(32);--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "allowed_models" json;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "model_redirects" json;--> statement-breakpoint
CREATE INDEX "upstreams_provider_type_idx" ON "upstreams" USING btree ("provider_type");
