CREATE TABLE daily_metrics (
  date TEXT PRIMARY KEY,
  hrv_avg_ms REAL,
  resting_hr_bpm REAL,
  avg_hr_bpm REAL,
  vo2max REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sleep_sessions (
  date TEXT PRIMARY KEY,
  in_bed_start TEXT,
  in_bed_end TEXT,
  asleep_hours REAL,
  deep_hours REAL,
  core_hours REAL,
  rem_hours REAL,
  awake_hours REAL,
  source TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  workout_type TEXT NOT NULL,
  start_ts TEXT NOT NULL,
  end_ts TEXT,
  duration_min REAL,
  active_energy_kcal REAL,
  distance_km REAL,
  avg_heart_rate REAL,
  max_heart_rate REAL,
  source TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE raw_ingest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE INDEX idx_workouts_start ON workouts(start_ts);
