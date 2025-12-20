# Implementation Tasks: refactor-api-key-viewable-storage

## Phase 1: Database Migration

- [ ] **1.1** Create Alembic migration file
  - [ ] Add `key_value_encrypted TEXT NULL` column to `api_keys` table
  - [ ] Keep `key_hash` column (backward compatibility)
  - [ ] Add index on `key_value_encrypted` (optional, for performance)

- [ ] **1.2** Test migration
  - [ ] Run migration on test database
  - [ ] Verify schema changes
  - [ ] Test rollback

## Phase 2: Backend Implementation

- [ ] **2.1** Encryption Utilities
  - [ ] Verify `app/core/encryption.py` has Fernet encrypt/decrypt functions
  - [ ] Add `encrypt_api_key()` and `decrypt_api_key()` helpers (reuse existing Fernet instance)

- [ ] **2.2** Update `app/models/db_models.py`
  - [ ] Add `key_value_encrypted: Mapped[str | None]` field to `APIKey` model

- [ ] **2.3** Update `app/models/schemas.py`
  - [ ] Add `APIKeyRevealResponse` schema (with `key_value` field)

- [ ] **2.4** Modify `app/services/key_manager.py`
  - [ ] Update `create_api_key()`:
    - Keep bcrypt hashing (for backward compatibility)
    - Add Fernet encryption of full key
    - Store in `key_value_encrypted` column
  - [ ] Add `reveal_api_key(db, key_id)` function:
    - Query key by ID
    - Check if `key_value_encrypted` exists
    - Decrypt and return key
    - If only `key_hash` exists, return error "Legacy key"

- [ ] **2.5** Create Admin API Endpoint
  - [ ] Add `POST /admin/keys/{id}/reveal` route in `app/api/routes/admin.py`
  - [ ] Require admin token authentication
  - [ ] Call `reveal_api_key()` service
  - [ ] Return `APIKeyRevealResponse`

- [ ] **2.6** Audit Logging
  - [ ] Log reveal operations to `request_logs` table with:
    - `api_key_id`: The key being revealed
    - `method`: "REVEAL"
    - `path`: `/admin/keys/{id}/reveal`
    - `created_at`: Timestamp
  - [ ] Alternative: Create dedicated `key_reveal_logs` table (if `request_logs` doesn't fit)

- [ ] **2.7** Feature Flag
  - [ ] Add `ALLOW_KEY_REVEAL` to `app/core/config.py` (default: `true`)
  - [ ] Check flag in reveal endpoint (return 403 if disabled)

- [ ] **2.8** Update Key Validation (Optional)
  - [ ] Verify existing `validate_api_key()` still works with bcrypt
  - [ ] No changes needed (validation uses `key_hash`, not `key_value_encrypted`)

## Phase 3: Frontend Implementation

- [ ] **3.1** Update `apps/web/src/types/api.ts`
  - [ ] Add `key_value?: string` to `APIKey` type (optional field)
  - [ ] Add `APIKeyRevealResponse` interface

- [ ] **3.2** Update `apps/web/src/lib/api.ts` or `apiClient.ts`
  - [ ] Add `revealAPIKey(keyId: string)` function:
    - POST to `/admin/keys/{keyId}/reveal`
    - Return revealed key value

- [ ] **3.3** Update `apps/web/src/components/admin/keys-table.tsx`
  - [ ] Add state: `visibleKeyIds: Set<string>` (track which keys are revealed)
  - [ ] Add state: `revealedKeys: Map<string, string>` (store revealed values)
  - [ ] Modify key display logic:
    - Default: Show masked key `sk-auto-ab***xyz` (first 8 + last 4 chars of `key_prefix`)
    - If key is in `visibleKeyIds`: Show full key from `revealedKeys`
  - [ ] Add Eye/EyeOff icon button:
    - Import `Eye`, `EyeOff` from `lucide-react`
    - On click:
      - If hidden: Call `revealAPIKey()`, store in `revealedKeys`, add to `visibleKeyIds`
      - If visible: Remove from `visibleKeyIds` (keep in `revealedKeys` cache)
  - [ ] Update copy button:
    - If key is revealed: Copy full key from `revealedKeys`
    - If key is hidden: Copy `key_prefix` (current behavior)
  - [ ] Handle legacy keys:
    - If reveal API returns 400 "Legacy key": Show tooltip "Regenerate key to enable reveal"

- [ ] **3.4** Update Internationalization
  - [ ] Add to `apps/web/src/messages/en.json`:
    - `"keys.revealKey": "Reveal key"`
    - `"keys.hideKey": "Hide key"`
    - `"keys.legacyKey": "Legacy key - regenerate to enable reveal"`
  - [ ] Add to `apps/web/src/messages/zh-CN.json`:
    - `"keys.revealKey": "显示密钥"`
    - `"keys.hideKey": "隐藏密钥"`
    - `"keys.legacyKey": "旧版密钥 - 需重新生成以启用查看"`

## Phase 4: Testing

- [ ] **4.1** Backend Tests
  - [ ] Test `reveal_api_key()` service function
  - [ ] Test `/admin/keys/{id}/reveal` endpoint (success case)
  - [ ] Test reveal endpoint (key not found)
  - [ ] Test reveal endpoint (legacy key without encryption)
  - [ ] Test feature flag (`ALLOW_KEY_REVEAL=false`)

- [ ] **4.2** Frontend Tests (Optional)
  - [ ] Test masked key display
  - [ ] Test eye icon toggle
  - [ ] Test copy button with revealed key

- [ ] **4.3** Integration Test
  - [ ] Create new key → Verify encrypted value stored
  - [ ] List keys → Verify masked display
  - [ ] Reveal key → Verify full value matches creation response
  - [ ] Copy revealed key → Verify clipboard content

## Phase 5: Documentation

- [ ] **5.1** Update README (if applicable)
  - [ ] Document `ALLOW_KEY_REVEAL` environment variable
  - [ ] Explain security trade-offs

- [ ] **5.2** Update OpenSpec Specs
  - [ ] Modify `specs/api-key-auth/spec.md`:
    - Update "Secure API Key Storage" requirement
    - Add "Reveal API Key" requirement
  - [ ] Modify `specs/admin-console-keys/spec.md` (if exists):
    - Add UI scenarios for reveal functionality

## Completion Checklist

- [ ] All migrations run successfully
- [ ] All backend tests pass
- [ ] All frontend tests pass (if added)
- [ ] Linting passes (`ruff check`, `npm run lint`)
- [ ] Type checking passes (`mypy`, `npm run typecheck`)
- [ ] Manual testing completed
- [ ] PR created and reviewed
- [ ] Changes deployed
- [ ] Archive proposal to `changes/archive/YYYY-MM-DD-refactor-api-key-viewable-storage/`
