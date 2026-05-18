CREATE TABLE "traffic_recording_settings" (
	"id" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" varchar(16) DEFAULT 'failure' NOT NULL,
	"redact_sensitive" boolean DEFAULT true NOT NULL,
	"retention_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_log_id" uuid,
	"api_key_id" uuid,
	"upstream_id" uuid,
	"method" varchar(10),
	"path" text,
	"model" varchar(128),
	"status_code" integer,
	"outcome" varchar(16) NOT NULL,
	"fixture_path" text NOT NULL,
	"fixture_size_bytes" integer DEFAULT 0 NOT NULL,
	"request_size_bytes" integer DEFAULT 0 NOT NULL,
	"response_size_bytes" integer DEFAULT 0 NOT NULL,
	"redacted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traffic_recordings_fixture_path_unique" UNIQUE("fixture_path")
);
--> statement-breakpoint
ALTER TABLE "traffic_recordings" ADD CONSTRAINT "traffic_recordings_request_log_id_request_logs_id_fk" FOREIGN KEY ("request_log_id") REFERENCES "public"."request_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_recordings" ADD CONSTRAINT "traffic_recordings_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_recordings" ADD CONSTRAINT "traffic_recordings_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traffic_recordings_request_log_id_idx" ON "traffic_recordings" USING btree ("request_log_id");--> statement-breakpoint
CREATE INDEX "traffic_recordings_api_key_id_idx" ON "traffic_recordings" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "traffic_recordings_upstream_id_idx" ON "traffic_recordings" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "traffic_recordings_status_code_idx" ON "traffic_recordings" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "traffic_recordings_model_idx" ON "traffic_recordings" USING btree ("model");--> statement-breakpoint
CREATE INDEX "traffic_recordings_created_at_idx" ON "traffic_recordings" USING btree ("created_at");
