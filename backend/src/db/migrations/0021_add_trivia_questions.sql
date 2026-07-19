CREATE TABLE IF NOT EXISTS trivia_questions (
  id TEXT PRIMARY KEY NOT NULL,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_answer_index INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  source_numeric_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS trivia_questions_difficulty_idx
ON trivia_questions (difficulty);

CREATE INDEX IF NOT EXISTS trivia_questions_category_idx
ON trivia_questions (category);
