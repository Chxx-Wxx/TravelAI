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
