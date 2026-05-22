CREATE TABLE "cliproxy_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"mode" varchar(16) DEFAULT 'managed' NOT NULL,
	"base_url" text NOT NULL,
	"management_url" text NOT NULL,
	"client_api_key_encrypted" text NOT NULL,
	"management_key_encrypted" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliproxy_instances_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "cliproxy_instances_name_idx" ON "cliproxy_instances" USING btree ("name");--> statement-breakpoint
CREATE INDEX "cliproxy_instances_enabled_idx" ON "cliproxy_instances" USING btree ("enabled");
