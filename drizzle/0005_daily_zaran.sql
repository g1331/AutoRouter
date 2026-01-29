CREATE TABLE "circuit_breaker_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upstream_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'closed' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"last_probe_at" timestamp with time zone,
	"config" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circuit_breaker_states_upstream_id_unique" UNIQUE("upstream_id")
);
--> statement-breakpoint
ALTER TABLE "circuit_breaker_states" ADD CONSTRAINT "circuit_breaker_states_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circuit_breaker_states_upstream_id_idx" ON "circuit_breaker_states" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "circuit_breaker_states_state_idx" ON "circuit_breaker_states" USING btree ("state");
