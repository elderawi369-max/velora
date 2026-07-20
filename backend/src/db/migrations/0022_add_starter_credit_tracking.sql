ALTER TABLE profiles ADD COLUMN starter_credits_granted_at INTEGER;

CREATE TABLE starter_credit_grants (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  install_id TEXT,
  ip_address TEXT,
  granted_at INTEGER NOT NULL
);

CREATE INDEX starter_credit_grants_install_idx
  ON starter_credit_grants(install_id, granted_at);

CREATE INDEX starter_credit_grants_ip_idx
  ON starter_credit_grants(ip_address, granted_at);
