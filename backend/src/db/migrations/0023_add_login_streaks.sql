ALTER TABLE users ADD COLUMN login_streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN login_streak_last_check_in_day INTEGER;
ALTER TABLE users ADD COLUMN login_streak_last_rewarded_day INTEGER;
ALTER TABLE users ADD COLUMN login_streak_last_reminder_day INTEGER;
