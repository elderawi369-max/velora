CREATE TABLE challenge_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  sender_profile_id TEXT NOT NULL REFERENCES profiles(id),
  recipient_profile_id TEXT NOT NULL REFERENCES profiles(id),
  question_set TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  declined_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE challenge_responses (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES challenge_sessions(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  answers TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
);
