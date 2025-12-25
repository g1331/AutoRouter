# Change Proposal: refactor-api-key-viewable-storage

## Motivation

Users need to view complete API keys after creation, not just the prefix. Currently, keys are hashed with bcrypt (one-way, irreversible), so they can only be shown once at creation time. This creates a poor user experience where losing the key requires generating a new one.

### User Request

> "不应该只能在创建的时候查看,后续应该都能查看,默认在页面显示时中间显示\*,点击icon后显示完整的key,需要按钮方便复制"
>
> Translation: "Should not only be viewable at creation time, should be viewable anytime later. Default display should mask the middle with \*, click icon to show full key, need a copy button."

### Current Behavior (Issue)

- API keys use bcrypt one-way hashing (`key_hash` column)
- Full key returned only once in creation response
- After creation, only `key_prefix` (first 12 chars) is available
- Users must regenerate keys if lost

### Desired Behavior

- API keys stored with reversible encryption (like upstream keys)
- Keys can be revealed anytime via admin interface
- Default display: masked (e.g., `sk-auto-ab***xyz`)
- Toggle visibility with eye icon
- Copy button copies complete key
- Audit logging for all reveal operations

## Scope

### In Scope

1. **Database Migration**: Add `key_value_encrypted` column (Fernet encryption)
2. **Backend API**: New `POST /admin/keys/{id}/reveal` endpoint
3. **Encryption**: Reuse existing Fernet utilities (from upstream keys)
4. **Frontend UI**: Masked display, toggle visibility, copy complete key
5. **Audit Logging**: Record all key reveal operations to `request_logs`
6. **Backward Compatibility**: Support both bcrypt (legacy) and encrypted keys

### Out of Scope

- Multi-factor authentication for key reveal
- Per-user permissions (single admin token for now)
- Key rotation/regeneration features
- Migration tool for existing bcrypt keys (manual regeneration required)

## Impact Assessment

### Breaking Changes

- **None for API consumers** - External API key authentication unchanged
- **Schema change** - Requires database migration (non-breaking, additive)
- **Security model change** - From "never retrievable" to "admin can reveal"

### Risk Analysis

| Risk                                              | Mitigation                                                 |
| ------------------------------------------------- | ---------------------------------------------------------- |
| Database + encryption key leak = all keys exposed | Audit logging, rate limiting, environment separation       |
| Shoulder surfing attack (viewing screens)         | Default masked display, click to reveal                    |
| Bulk export attacks                               | Rate limiting on reveal endpoint (TBD: 10 requests/minute) |
| Internal abuse                                    | Audit logs record WHO revealed WHICH key WHEN              |

### Deployment Requirements

1. Set `ALLOW_KEY_REVEAL=true` environment variable (feature flag)
2. Run Alembic migration to add `key_value_encrypted` column
3. No downtime required (backward compatible)
4. Existing bcrypt keys continue working (no forced migration)

## Security Trade-Offs

### Current Model (bcrypt)

✅ Maximum security - database breach does not expose keys
✅ Industry best practice (GitHub tokens, AWS secrets)
✅ Compliance-friendly (SOC2, ISO27001)
❌ Poor UX - lost keys cannot be recovered

### Proposed Model (Fernet encryption)

✅ Better UX - keys can be revealed anytime
✅ Same model as upstream keys (consistency)
❌ Database + `ENCRYPTION_KEY` leak = all keys exposed
❌ Deviates from security best practices for API keys

### Recommendation

**This change is suitable for**:

- Self-hosted deployments (user controls encryption key)
- Internal tools / small teams
- Scenarios where UX > maximum security

**NOT recommended for**:

- Multi-tenant SaaS (centralized key management risk)
- Compliance-required environments (SOC2, HIPAA, PCI-DSS)
- High-security applications (fintech, healthcare)

## Implementation Strategy

### Phase 1: Database Schema

- Add `key_value_encrypted TEXT NULL` column to `api_keys` table
- Keep `key_hash` column for backward compatibility
- Migration: Alembic script `add_key_value_encrypted_column`

### Phase 2: Backend Logic

- Modify `create_api_key()`: Store both `key_hash` (bcrypt) AND `key_value_encrypted` (Fernet)
- New endpoint: `POST /admin/keys/{id}/reveal` (returns decrypted key)
- Update key validation: Check `key_hash` first (bcrypt), fallback to `key_value_encrypted`
- Audit logging: Log reveals to `request_logs` with special action type

### Phase 3: Frontend UI

- Update `keys-table.tsx`:
  - Display masked key: `sk-auto-ab***xyz` (show first 8 + last 4 chars)
  - Add Eye/EyeOff icon (lucide-react)
  - On click: Call `/admin/keys/{id}/reveal`, display full key
  - Copy button copies revealed key (not just prefix)
  - Show "Legacy key - regenerate to enable reveal" for bcrypt-only keys

### Feature Flag

- Environment variable: `ALLOW_KEY_REVEAL` (default: `false`)
- If `false`: Return 403 on reveal endpoint (safety switch)

## Approval

**Approved by**: @g1331 (issue comment: "批准提案,开始实施")

**Date**: 2025-12-20

**Implementation Start**: Authorized

---

**Related Issues**: #5
**Related Specs**:

- `specs/api-key-auth/spec.md` (MODIFIED)
- `specs/admin-console-keys/spec.md` (MODIFIED)
