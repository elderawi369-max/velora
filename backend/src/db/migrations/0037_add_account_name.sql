ALTER TABLE users ADD COLUMN name TEXT;

UPDATE users
SET name = COALESCE(
  (SELECT display_name FROM profiles WHERE profiles.user_id = users.id LIMIT 1),
  CASE
    WHEN instr(email, '@') > 1 THEN substr(email, 1, instr(email, '@') - 1)
    ELSE 'Velora member'
  END
)
WHERE name IS NULL OR trim(name) = '';
