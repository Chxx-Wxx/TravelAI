-- TravelAI expense ledger sync foundation.
-- This migration is additive and safe to run repeatedly.

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_user
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

-- A legacy placeholder claim is not sufficient proof for private expense data.
-- Only a future verified invite/account migration may insert this grant.
CREATE TABLE IF NOT EXISTS trip_expense_access_grants (
  trip_id TEXT NOT NULL
    REFERENCES trips(id)
    ON DELETE CASCADE,
  member_id UUID NOT NULL
    REFERENCES trip_members(id)
    ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  grant_source TEXT NOT NULL
    CHECK (grant_source IN ('verified_invite', 'verified_migration')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, member_id, user_id),
  UNIQUE (trip_id, member_id),
  UNIQUE (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS trip_expense_ledgers (
  trip_id TEXT PRIMARY KEY
    REFERENCES trips(id)
    ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_transactions (
  id TEXT NOT NULL,
  trip_id TEXT NOT NULL
    REFERENCES trips(id)
    ON DELETE CASCADE,
  expense_type TEXT NOT NULL
    CHECK (expense_type IN ('personal', 'shared', 'loan')),
  currency TEXT NOT NULL
    CHECK (currency IN ('KRW', 'JPY', 'USD', 'EUR')),
  local_amount BIGINT NOT NULL
    CHECK (local_amount > 0),
  owner_member_id UUID
    REFERENCES trip_members(id),
  paid_by_member_id UUID
    REFERENCES trip_members(id),
  lender_member_id UUID
    REFERENCES trip_members(id),
  borrower_member_id UUID
    REFERENCES trip_members(id),
  participant_member_ids UUID[] NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1
    CHECK (version > 0),
  ledger_revision BIGINT NOT NULL,
  idempotency_key TEXT,
  request_hash TEXT,
  created_by_member_id UUID NOT NULL
    REFERENCES trip_members(id),
  updated_by_member_id UUID NOT NULL
    REFERENCES trip_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  PRIMARY KEY (trip_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_transactions_idempotency
  ON expense_transactions (trip_id, created_by_member_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_transactions_trip_revision
  ON expense_transactions (trip_id, ledger_revision);

CREATE TABLE IF NOT EXISTS expense_settlement_payments (
  id TEXT NOT NULL,
  trip_id TEXT NOT NULL
    REFERENCES trips(id)
    ON DELETE CASCADE,
  source TEXT NOT NULL
    CHECK (source IN ('final', 'loan')),
  from_member_id UUID NOT NULL
    REFERENCES trip_members(id),
  to_member_id UUID NOT NULL
    REFERENCES trip_members(id),
  currency TEXT NOT NULL
    CHECK (currency IN ('KRW', 'JPY', 'USD', 'EUR')),
  local_amount BIGINT NOT NULL
    CHECK (local_amount > 0),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1
    CHECK (version > 0),
  ledger_revision BIGINT NOT NULL,
  idempotency_key TEXT,
  request_hash TEXT,
  created_by_member_id UUID NOT NULL
    REFERENCES trip_members(id),
  updated_by_member_id UUID NOT NULL
    REFERENCES trip_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  PRIMARY KEY (trip_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_payments_idempotency
  ON expense_settlement_payments (
    trip_id,
    created_by_member_id,
    idempotency_key
  )
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_payments_trip_revision
  ON expense_settlement_payments (trip_id, ledger_revision);

CREATE TABLE IF NOT EXISTS expense_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL
    REFERENCES trips(id)
    ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('transaction', 'payment')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('created', 'updated', 'cancelled', 'restored', 'imported')),
  version INTEGER NOT NULL,
  ledger_revision BIGINT NOT NULL,
  changed_by_member_id UUID NOT NULL
    REFERENCES trip_members(id),
  before_payload JSONB,
  after_payload JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_change_log_trip_revision
  ON expense_change_log (trip_id, ledger_revision);
