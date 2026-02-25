ALTER TABLE "request_logs" ADD COLUMN "ttft_ms" integer;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "is_stream" boolean DEFAULT false NOT NULL;
