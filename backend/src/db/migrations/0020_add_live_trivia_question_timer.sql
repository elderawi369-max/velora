ALTER TABLE live_trivia_matches
  ADD COLUMN current_question_started_at INTEGER NOT NULL DEFAULT 0;

UPDATE live_trivia_matches
SET current_question_started_at = started_at
WHERE current_question_started_at = 0;
