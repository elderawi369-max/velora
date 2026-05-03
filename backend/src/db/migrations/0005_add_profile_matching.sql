ALTER TABLE profiles ADD COLUMN identity TEXT NOT NULL DEFAULT 'prefer not to say';
ALTER TABLE profiles ADD COLUMN looking_for TEXT NOT NULL DEFAULT 'any';
