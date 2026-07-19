CREATE TABLE live_trivia_queue (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id),
  joined_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL
);

CREATE TABLE live_trivia_matches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  player_a_id TEXT NOT NULL REFERENCES profiles(id),
  player_b_id TEXT NOT NULL REFERENCES profiles(id),
  question_set TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE live_trivia_answers (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES live_trivia_matches(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  question_index INTEGER NOT NULL,
  answer_index INTEGER NOT NULL,
  is_correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX live_trivia_answers_match_profile_question_idx
  ON live_trivia_answers(match_id, profile_id, question_index);

CREATE INDEX live_trivia_queue_heartbeat_idx
  ON live_trivia_queue(heartbeat_at);

CREATE INDEX live_trivia_matches_status_updated_idx
  ON live_trivia_matches(status, updated_at);
