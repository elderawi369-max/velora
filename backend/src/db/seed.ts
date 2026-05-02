import type { EnvBindings } from "../lib/db";

const seedStatements = [
  `INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, created_at, updated_at)
   VALUES
   ('user-seed-1', 'mina@example.com', 'seed-hash', 'seed-salt', 1700000000000, 1700000000000),
   ('user-seed-2', 'omar@example.com', 'seed-hash', 'seed-salt', 1700000000000, 1700000000000);`,
  `INSERT OR IGNORE INTO profiles (
      id, user_id, username, display_name, bio, avatar_preset, boundaries, vibe_tags, created_at, updated_at
    )
    VALUES
    (
      'profile-seed-1',
      'user-seed-1',
      'softnightowl',
      'Mina',
      'Warm late-night talker who likes soft flirting, gentle teasing, and comforting check-ins.',
      'rose',
      '["no off-app contact","kind tone only","text-only always"]',
      '["sweet","listener","late-night chatter"]',
      1700000000000,
      1700000000000
    ),
    (
      'profile-seed-2',
      'user-seed-2',
      'calmcurrent',
      'Omar',
      'Calm, thoughtful conversation style with a focus on deep talk and patient energy.',
      'echo',
      '["no off-app contact","slow replies are okay","text-only always"]',
      '["deep talker","soft-spoken","playful"]',
      1700000000000,
      1700000000000
    );`,
];

export async function seedDatabase(env: EnvBindings) {
  for (const statement of seedStatements) {
    await env.DB.prepare(statement).run();
  }
}
