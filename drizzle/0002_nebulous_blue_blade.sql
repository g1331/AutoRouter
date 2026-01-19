CREATE TABLE "upstream_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"strategy" varchar(32) DEFAULT 'round_robin' NOT NULL,
	"health_check_interval" integer DEFAULT 30 NOT NULL,
	"health_check_timeout" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upstream_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "upstream_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upstream_id" uuid NOT NULL,
	"is_healthy" boolean DEFAULT true NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error_message" text,
	CONSTRAINT "upstream_health_upstream_id_unique" UNIQUE("upstream_id")
);
--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "weight" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "upstream_health" ADD CONSTRAINT "upstream_health_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upstream_groups_name_idx" ON "upstream_groups" USING btree ("name");--> statement-breakpoint
CREATE INDEX "upstream_groups_is_active_idx" ON "upstream_groups" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "upstream_health_upstream_id_idx" ON "upstream_health" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "upstream_health_is_healthy_idx" ON "upstream_health" USING btree ("is_healthy");--> statement-breakpoint
ALTER TABLE "upstreams" ADD CONSTRAINT "upstreams_group_id_upstream_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."upstream_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upstreams_group_id_idx" ON "upstreams" USING btree ("group_id");