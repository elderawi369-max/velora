ALTER TABLE ai_companion_conversations ADD COLUMN relationship_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_companion_conversations ADD COLUMN relationship_stage TEXT NOT NULL DEFAULT 'new';

UPDATE ai_companion_conversations
SET relationship_points = trial_replies_used,
    relationship_stage = CASE
      WHEN trial_replies_used >= 24 THEN 'established'
      WHEN trial_replies_used >= 6 THEN 'familiar'
      ELSE 'new'
    END;
