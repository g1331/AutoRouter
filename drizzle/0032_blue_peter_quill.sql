CREATE TABLE "upstream_failure_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upstream_id" uuid,
	"name" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"match" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "failure_rule_config" json;--> statement-breakpoint
ALTER TABLE "upstream_failure_rules" ADD CONSTRAINT "upstream_failure_rules_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upstream_failure_rules_upstream_id_idx" ON "upstream_failure_rules" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "upstream_failure_rules_enabled_idx" ON "upstream_failure_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "upstream_failure_rules_priority_idx" ON "upstream_failure_rules" USING btree ("priority");
