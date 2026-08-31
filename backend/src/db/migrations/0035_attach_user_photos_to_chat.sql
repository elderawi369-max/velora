DROP INDEX IF EXISTS ai_companion_user_photos_one_approved_idx;

ALTER TABLE ai_companion_user_photos
  ADD COLUMN message_id TEXT REFERENCES ai_companion_messages(id);

CREATE UNIQUE INDEX ai_companion_user_photos_message_idx
  ON ai_companion_user_photos(message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX ai_companion_user_photos_chat_idx
  ON ai_companion_user_photos(user_id, companion_id, status, created_at);
