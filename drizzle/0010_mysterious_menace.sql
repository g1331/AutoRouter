-- Add session affinity columns to request_logs
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "session_id" text;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "affinity_hit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "affinity_migrated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "routing_duration_ms" integer;--> statement-breakpoint

-- Add affinity_migration column to upstreams
ALTER TABLE "upstreams" ADD COLUMN IF NOT EXISTS "affinity_migration" json;
