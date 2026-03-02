-- Migrate from 3 flat spending columns to single JSON array column
-- Converts existing data: {spending_limit, spending_period_type, spending_period_hours} → spending_rules JSON array

ALTER TABLE "upstreams" ADD COLUMN "spending_rules" json;--> statement-breakpoint

UPDATE "upstreams"
SET "spending_rules" = json_build_array(
  json_build_object(
    'period_type', "spending_period_type",
    'limit', "spending_limit",
    'period_hours', "spending_period_hours"
  )
)
WHERE "spending_limit" IS NOT NULL AND "spending_period_type" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "upstreams" DROP COLUMN IF EXISTS "spending_limit";--> statement-breakpoint
ALTER TABLE "upstreams" DROP COLUMN IF EXISTS "spending_period_type";--> statement-breakpoint
ALTER TABLE "upstreams" DROP COLUMN IF EXISTS "spending_period_hours";
