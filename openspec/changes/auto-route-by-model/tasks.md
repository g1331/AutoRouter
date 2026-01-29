## 1. Database Schema

- [x] 1.1 Add `provider_type` column to `upstreams` table (enum: anthropic, openai, google, custom)
- [x] 1.2 Add `allowed_models` column to `upstreams` table (JSON array, nullable)
- [x] 1.3 Add `model_redirects` column to `upstreams` table (JSON object, nullable)
- [x] 1.4 Generate and apply database migration
- [x] 1.5 Write tests for new schema columns

## 2. Upstream Service Updates

- [x] 2.1 Update `Upstream` type to include `providerType`, `allowedModels`, `modelRedirects`
- [x] 2.2 Update upstream CRUD operations to handle new fields
- [x] 2.3 Add validation for `providerType` enum values
- [x] 2.4 Add validation for `modelRedirects` to prevent circular redirects
- [x] 2.5 Write unit tests for upstream service with new fields

## 3. Model-Based Router Service

- [x] 3.1 Create `ModelRouter` service with `routeByModel(model: string)` method
- [x] 3.2 Implement model prefix to group mapping (claude-_ → anthropic, gpt-_ → openai, gemini-\* → google)
- [x] 3.3 Implement `allowedModels` filtering logic
- [x] 3.4 Implement `modelRedirects` transformation logic
- [x] 3.5 Add circular redirect detection
- [x] 3.6 Write unit tests for ModelRouter service

## 4. Proxy Route Refactoring

- [x] 4.1 Remove `X-Upstream-Name` header handling from proxy route
- [x] 4.2 Remove `X-Upstream-Group` header handling from proxy route
- [x] 4.3 Integrate ModelRouter into proxy request flow
- [x] 4.4 Update request body parsing to extract model field
- [x] 4.5 Update error handling for missing model field
- [x] 4.6 Update error handling for non-existent group
- [x] 4.7 Write integration tests for new routing flow

## 5. Admin API Updates

- [x] 5.1 Update upstream list API to include new fields
- [x] 5.2 Update upstream create API to accept new fields
- [x] 5.3 Update upstream update API to accept new fields
- [x] 5.4 Write tests for Admin API with new fields

## 6. Admin UI Updates

- [x] 6.1 Add `Provider Type` selector to upstream create/edit forms
- [x] 6.2 Add `Allowed Models` input field (tag input or comma-separated)
- [x] 6.3 Add `Model Redirects` key-value input field
- [x] 6.4 Update upstream list display to show provider type
- [x] 6.5 Update translations for new fields (en, zh-CN)

## 7. Request Logger Updates

- [x] 7.1 Update `routing_type` to use "auto" instead of "direct"/"group"/"default"
- [x] 7.2 Remove `routing_decision` fields that are no longer applicable
- [ ] 7.3 Update logs table UI to reflect new routing type

## 8. Migration and Cleanup

- [ ] 8.1 Create database migration script for existing upstreams (set default provider_type)
- [ ] 8.2 Update API Key configuration to remove upstream association (if applicable)
- [ ] 8.3 Remove deprecated header-based routing code
- [ ] 8.4 Update documentation to remove Header routing references

## 9. Verification

- [ ] 9.1 Run full test suite (`pnpm test:run`)
- [ ] 9.2 Run type check (`pnpm exec tsc --noEmit`)
- [ ] 9.3 Run lint (`pnpm lint`)
- [ ] 9.4 Verify build succeeds (`pnpm build`)
- [ ] 9.5 Manual testing: gpt-4 request routes to openai group
- [ ] 9.6 Manual testing: claude-3 request routes to anthropic group
- [ ] 9.7 Manual testing: missing model returns 400 error
- [ ] 9.8 Manual testing: model redirect works correctly
