ALTER TABLE "request_logs" ADD COLUMN "api_key_name" varchar(255);--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "api_key_prefix" varchar(16);
--> statement-breakpoint
UPDATE "request_logs" AS rl
SET
  "api_key_name" = ak."name",
  "api_key_prefix" = ak."key_prefix"
FROM "api_keys" AS ak
WHERE rl."api_key_id" = ak."id"
  AND (rl."api_key_name" IS NULL OR rl."api_key_prefix" IS NULL);
