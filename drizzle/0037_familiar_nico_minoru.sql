ALTER TABLE "upstreams" ADD COLUMN "cliproxy_instance_id" uuid;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "cliproxy_auth_file_name" text;--> statement-breakpoint
ALTER TABLE "upstreams" ADD COLUMN "cliproxy_provider" varchar(32);--> statement-breakpoint
ALTER TABLE "upstreams" ADD CONSTRAINT "upstreams_cliproxy_instance_id_cliproxy_instances_id_fk" FOREIGN KEY ("cliproxy_instance_id") REFERENCES "public"."cliproxy_instances"("id") ON DELETE set null ON UPDATE no action;
