-- Remove legacy provider_type after route-capabilities routing rollout
DROP INDEX IF EXISTS "upstreams_provider_type_priority_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "upstreams_provider_type_idx";--> statement-breakpoint
ALTER TABLE "upstreams" DROP COLUMN IF EXISTS "provider_type";
