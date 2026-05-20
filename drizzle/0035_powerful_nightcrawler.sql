CREATE TABLE "cliproxy_auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"auth_file_name" text NOT NULL,
	"provider" varchar(32) NOT NULL,
	"email" text,
	"status" varchar(32),
	"disabled" boolean DEFAULT false NOT NULL,
	"prefix" text,
	"model_count" integer DEFAULT 0 NOT NULL,
	"priority" integer,
	"note" text,
	"raw_metadata" json,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliproxy_auth_accounts_instance_file_unique" UNIQUE("instance_id","auth_file_name")
);
--> statement-breakpoint
ALTER TABLE "cliproxy_auth_accounts" ADD CONSTRAINT "cliproxy_auth_accounts_instance_id_cliproxy_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."cliproxy_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cliproxy_auth_accounts_instance_id_idx" ON "cliproxy_auth_accounts" USING btree ("instance_id");
