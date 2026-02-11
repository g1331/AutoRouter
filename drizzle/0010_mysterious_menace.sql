CREATE TABLE "api_key_upstreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"upstream_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_api_key_upstream" UNIQUE("api_key_id","upstream_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"key_value_encrypted" text,
	"key_prefix" varchar(16) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "circuit_breaker_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upstream_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'closed' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"last_probe_at" timestamp with time zone,
	"config" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circuit_breaker_states_upstream_id_unique" UNIQUE("upstream_id")
);
--> statement-breakpoint
CREATE TABLE "request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid,
	"upstream_id" uuid,
	"method" varchar(10),
	"path" text,
	"model" varchar(128),
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"status_code" integer,
	"duration_ms" integer,
	"routing_duration_ms" integer,
	"error_message" text,
	"routing_type" varchar(16),
	"group_name" varchar(64),
	"lb_strategy" varchar(32),
	"priority_tier" integer,
	"failover_attempts" integer DEFAULT 0 NOT NULL,
	"failover_history" text,
	"routing_decision" text,
	"session_id" text,
	"affinity_hit" boolean DEFAULT false NOT NULL,
	"affinity_migrated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upstream_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upstream_id" uuid NOT NULL,
	"is_healthy" boolean DEFAULT true NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error_message" text,
	CONSTRAINT "upstream_health_upstream_id_unique" UNIQUE("upstream_id")
);
--> statement-breakpoint
CREATE TABLE "upstreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"base_url" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"timeout" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"provider_type" varchar(32) DEFAULT 'openai' NOT NULL,
	"allowed_models" json,
	"model_redirects" json,
	"affinity_migration" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upstreams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "api_key_upstreams" ADD CONSTRAINT "api_key_upstreams_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_upstreams" ADD CONSTRAINT "api_key_upstreams_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuit_breaker_states" ADD CONSTRAINT "circuit_breaker_states_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upstream_health" ADD CONSTRAINT "upstream_health_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_upstreams_api_key_id_idx" ON "api_key_upstreams" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_key_upstreams_upstream_id_idx" ON "api_key_upstreams" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_is_active_idx" ON "api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "circuit_breaker_states_upstream_id_idx" ON "circuit_breaker_states" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "circuit_breaker_states_state_idx" ON "circuit_breaker_states" USING btree ("state");--> statement-breakpoint
CREATE INDEX "request_logs_api_key_id_idx" ON "request_logs" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "request_logs_upstream_id_idx" ON "request_logs" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "request_logs_created_at_idx" ON "request_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "request_logs_routing_type_idx" ON "request_logs" USING btree ("routing_type");--> statement-breakpoint
CREATE INDEX "upstream_health_upstream_id_idx" ON "upstream_health" USING btree ("upstream_id");--> statement-breakpoint
CREATE INDEX "upstream_health_is_healthy_idx" ON "upstream_health" USING btree ("is_healthy");--> statement-breakpoint
CREATE INDEX "upstreams_name_idx" ON "upstreams" USING btree ("name");--> statement-breakpoint
CREATE INDEX "upstreams_is_active_idx" ON "upstreams" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "upstreams_provider_type_priority_idx" ON "upstreams" USING btree ("provider_type","priority");
