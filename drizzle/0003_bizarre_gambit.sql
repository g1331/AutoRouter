ALTER TABLE "request_logs" ADD COLUMN "routing_type" varchar(16);--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "group_name" varchar(64);--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "lb_strategy" varchar(32);--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "failover_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "failover_history" text;--> statement-breakpoint
CREATE INDEX "request_logs_routing_type_idx" ON "request_logs" USING btree ("routing_type");
