ALTER TABLE notifications
ADD COLUMN challenge_session_id TEXT REFERENCES challenge_sessions(id);
