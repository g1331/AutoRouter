ALTER TABLE "upstream_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "upstreams" DROP CONSTRAINT "upstreams_group_id_upstream_groups_id_fk";
--> statement-breakpoint
DROP TABLE "upstream_groups" CASCADE;--> statement-breakpoint
DROP INDEX "upstreams_group_id_idx";--> statement-breakpoint
DROP INDEX "upstreams_provider_type_idx";--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "priority_tier" integer;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "upstreams_provider_type_priority_idx" ON "upstreams" USING btree ("provider_type","priority");--> statement-breakpoint
ALTER TABLE "upstreams" DROP COLUMN "group_id";
