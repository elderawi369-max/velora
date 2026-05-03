ALTER TABLE conversations ADD COLUMN last_message_preview TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN last_message_sender_profile_id TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN last_read_at_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN last_read_at_b INTEGER NOT NULL DEFAULT 0;
