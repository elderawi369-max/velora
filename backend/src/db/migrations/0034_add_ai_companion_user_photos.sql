CREATE TABLE ai_companion_user_photos (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  object_key TEXT,
  status TEXT NOT NULL DEFAULT 'quarantined',
  content_type TEXT,
  byte_size INTEGER,
  width INTEGER,
  height INTEGER,
  content_sha256 TEXT,
  moderation_provider TEXT,
  moderation_reason TEXT,
  replaced_by_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX ai_companion_user_photos_owner_status_idx
  ON ai_companion_user_photos(user_id, companion_id, status, created_at DESC);

CREATE UNIQUE INDEX ai_companion_user_photos_one_approved_idx
  ON ai_companion_user_photos(user_id, companion_id)
  WHERE status = 'approved';

CREATE TABLE ai_user_photo_upload_daily_usage (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  day_number INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX ai_user_photo_upload_daily_owner_day_idx
  ON ai_user_photo_upload_daily_usage(user_id, day_number);

CREATE TABLE ai_user_photo_upload_monthly_usage (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  billing_period TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX ai_user_photo_upload_monthly_owner_period_idx
  ON ai_user_photo_upload_monthly_usage(user_id, billing_period);
