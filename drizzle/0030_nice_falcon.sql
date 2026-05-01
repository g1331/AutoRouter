CREATE TABLE "cliproxyapi_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"mode" varchar(32) DEFAULT 'external' NOT NULL,
	"base_url" text NOT NULL,
	"client_api_key_encrypted" text,
	"management_url" text NOT NULL,
	"management_secret_encrypted" text,
	"outbound_proxy_url" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_status" varchar(16),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliproxyapi_connections_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "cliproxyapi_connections_name_idx" ON "cliproxyapi_connections" USING btree ("name");--> statement-breakpoint
CREATE INDEX "cliproxyapi_connections_is_default_idx" ON "cliproxyapi_connections" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "cliproxyapi_connections_is_enabled_idx" ON "cliproxyapi_connections" USING btree ("is_enabled");
