CREATE TABLE "user_upstreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"upstream_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_upstream" UNIQUE("user_id","upstream_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"password_hash" varchar(128) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "user_upstreams" ADD CONSTRAINT "user_upstreams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_upstreams" ADD CONSTRAINT "user_upstreams_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_upstreams_user_id_idx" ON "user_upstreams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_upstreams_upstream_id_idx" ON "user_upstreams" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_billing_snapshots" ADD CONSTRAINT "request_billing_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "request_billing_snapshots_user_id_idx" ON "request_billing_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "request_logs_user_id_idx" ON "request_logs" USING btree ("user_id");
