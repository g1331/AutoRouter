CREATE TABLE "upstream_probe_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upstream_id" uuid NOT NULL,
	"route_capability" varchar(64) NOT NULL,
	"client_profile" varchar(64) NOT NULL,
	"probe_template_id" varchar(96) NOT NULL,
	"probe_kind" varchar(64) NOT NULL,
	"status" varchar(64) NOT NULL,
	"layer" varchar(64) NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"latency_ms" integer,
	"first_byte_latency_ms" integer,
	"completed_latency_ms" integer,
	"status_code" integer,
	"error_type" varchar(64),
	"error_message" text,
	"probe_url" text,
	"model" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upstream_probe_results_identity_unique" UNIQUE("upstream_id","route_capability","client_profile","probe_template_id")
);
--> statement-breakpoint
ALTER TABLE "upstream_probe_results" ADD CONSTRAINT "upstream_probe_results_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upstream_probe_results_upstream_id_idx" ON "upstream_probe_results" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "upstream_probe_results_status_idx" ON "upstream_probe_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "upstream_probe_results_checked_at_idx" ON "upstream_probe_results" USING btree ("checked_at");
