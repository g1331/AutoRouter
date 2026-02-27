CREATE TABLE "compensation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"capabilities" json NOT NULL,
	"target_header" varchar(128) NOT NULL,
	"sources" json NOT NULL,
	"mode" varchar(32) DEFAULT 'missing_only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensation_rules_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "session_id_compensated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "header_diff" json;--> statement-breakpoint
CREATE INDEX "compensation_rules_enabled_idx" ON "compensation_rules" USING btree ("enabled");
--> statement-breakpoint
INSERT INTO "compensation_rules" ("id", "name", "is_builtin", "enabled", "capabilities", "target_header", "sources", "mode", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'Session ID Recovery',
  true,
  true,
  '["codex_responses","openai_chat_compatible","openai_extended"]',
  'session_id',
  '["headers.session_id","headers.session-id","headers.x-session-id","body.prompt_cache_key","body.metadata.session_id","body.previous_response_id"]',
  'missing_only',
  now(),
  now()
) ON CONFLICT ("name") DO NOTHING;
