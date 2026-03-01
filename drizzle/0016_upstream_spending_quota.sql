ALTER TABLE "upstreams" ADD COLUMN "spending_limit" double precision;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "spending_period_type" varchar
(16);--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "spending_period_hours" integer;
