-- Backfill: copy provider value to provider_type where provider_type is NULL
UPDATE "upstreams" SET "provider_type" = "provider" WHERE "provider_type" IS NULL;--> statement-breakpoint
ALTER TABLE "upstreams" ALTER COLUMN "provider_type" SET DEFAULT 'openai';--> statement-breakpoint
ALTER TABLE "upstreams" ALTER COLUMN "provider_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "upstreams" DROP COLUMN "provider";
