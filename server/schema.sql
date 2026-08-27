CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  trip_name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  people TEXT NOT NULL,
  members JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trips_members_array
    CHECK (jsonb_typeof(members) = 'array')
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider TEXT,
  auth_subject TEXT,
  display_name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_users_auth_identity
  ON users (auth_provider, auth_subject)
  WHERE auth_provider IS NOT NULL
    AND auth_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS trip_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL
    REFERENCES trips(id)
    ON DELETE CASCADE,
  user_id UUID
    REFERENCES users(id)
    ON DELETE SET NULL,
  legacy_member_id TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'placeholder'
    CHECK (status IN ('placeholder', 'active', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  UNIQUE (trip_id, legacy_member_id)
);

CREATE INDEX IF NOT EXISTS
  idx_trip_members_trip_status
  ON trip_members (trip_id, status);

CREATE INDEX IF NOT EXISTS
  idx_trip_members_user
  ON trip_members (user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_trip_members_active_user
  ON trip_members (trip_id, user_id)
  WHERE user_id IS NOT NULL
    AND status <> 'removed';

-- Keep trips.members during the transition, and backfill each legacy entry once.
-- The array position is a stable fallback identity when an old entry has no id.
INSERT INTO trip_members (
  trip_id,
  legacy_member_id,
  display_name,
  role,
  status
)
SELECT
  trip.id,
  COALESCE(
    NULLIF(member.value ->> 'id', ''),
    'legacy-index-' || member.ordinality
  ),
  COALESCE(
    NULLIF(BTRIM(member.value ->> 'displayName'), ''),
    NULLIF(BTRIM(member.value ->> 'name'), ''),
    'Unnamed member'
  ),
  CASE
    WHEN member.ordinality = 1 THEN 'owner'
    ELSE 'member'
  END,
  'placeholder'
FROM trips AS trip
CROSS JOIN LATERAL
  jsonb_array_elements(trip.members)
  WITH ORDINALITY AS member(value, ordinality)
ON CONFLICT (trip_id, legacy_member_id)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL
    REFERENCES trips(id)
    ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  place_id TEXT,
  category TEXT NOT NULL DEFAULT '기타',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  idx_schedules_trip_date_time
  ON schedules (trip_id, date, time);
