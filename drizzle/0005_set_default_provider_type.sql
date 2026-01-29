-- Migration: Set default provider_type for existing upstreams
-- This maps the existing 'provider' field to the new 'provider_type' field
-- for model-based auto-routing

-- Map 'anthropic' provider to 'anthropic' provider_type
UPDATE "upstreams"
SET "provider_type" = 'anthropic'
WHERE "provider" = 'anthropic'
  AND "provider_type" IS NULL;

-- Map 'openai' provider to 'openai' provider_type
UPDATE "upstreams"
SET "provider_type" = 'openai'
WHERE "provider" = 'openai'
  AND "provider_type" IS NULL;

-- Note: Upstreams with other provider values will keep provider_type as NULL
-- and need to be manually configured if they should participate in model-based routing
