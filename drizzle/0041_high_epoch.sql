CREATE TABLE "portal_settings" (
	"id" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"expose_upstreams" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
