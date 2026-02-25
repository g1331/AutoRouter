-- Add route_capabilities column to upstreams for path capability routing
ALTER TABLE "upstreams" ADD COLUMN IF NOT EXISTS "route_capabilities" json;
