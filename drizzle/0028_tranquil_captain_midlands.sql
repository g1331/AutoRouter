CREATE TABLE "background_sync_task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_name" varchar(128) NOT NULL,
	"trigger_type" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_sync_tasks" (
	"task_name" varchar(128) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_seconds" integer NOT NULL,
	"startup_delay_seconds" integer DEFAULT 0 NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"last_status" varchar(16),
	"last_error" text,
	"last_duration_ms" integer,
	"last_success_count" integer DEFAULT 0 NOT NULL,
	"last_failure_count" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "background_sync_task_runs_task_name_idx" ON "background_sync_task_runs" USING btree ("task_name");--> statement-breakpoint
CREATE INDEX "background_sync_task_runs_started_at_idx" ON "background_sync_task_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "background_sync_task_runs_status_idx" ON "background_sync_task_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "background_sync_tasks_enabled_idx" ON "background_sync_tasks" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "background_sync_tasks_next_run_at_idx" ON "background_sync_tasks" USING btree ("next_run_at");
