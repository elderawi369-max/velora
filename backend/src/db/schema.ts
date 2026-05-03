import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull(),
  avatarPreset: text("avatar_preset").notNull(),
  boundaries: text("boundaries").notNull(),
  vibeTags: text("vibe_tags").notNull(),
  suspendedAt: integer("suspended_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  profileAId: text("profile_a_id")
    .notNull()
    .references(() => profiles.id),
  profileBId: text("profile_b_id")
    .notNull()
    .references(() => profiles.id),
  lastMessageAt: integer("last_message_at").notNull(),
  lastMessagePreview: text("last_message_preview").notNull(),
  lastMessageSenderProfileId: text("last_message_sender_profile_id")
    .notNull()
    .references(() => profiles.id),
  lastReadAtA: integer("last_read_at_a").notNull(),
  lastReadAtB: integer("last_read_at_b").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  senderProfileId: text("sender_profile_id")
    .notNull()
    .references(() => profiles.id),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const favorites = sqliteTable("favorites", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  targetProfileId: text("target_profile_id")
    .notNull()
    .references(() => profiles.id),
  createdAt: integer("created_at").notNull(),
});

export const blocks = sqliteTable("blocks", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  targetProfileId: text("target_profile_id")
    .notNull()
    .references(() => profiles.id),
  createdAt: integer("created_at").notNull(),
});

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterProfileId: text("reporter_profile_id")
    .notNull()
    .references(() => profiles.id),
  targetProfileId: text("target_profile_id")
    .notNull()
    .references(() => profiles.id),
  conversationId: text("conversation_id").references(() => conversations.id),
  reason: text("reason").notNull(),
  details: text("details").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const gifts = sqliteTable("gifts", {
  id: text("id").primaryKey(),
  senderProfileId: text("sender_profile_id")
    .notNull()
    .references(() => profiles.id),
  targetProfileId: text("target_profile_id")
    .notNull()
    .references(() => profiles.id),
  giftType: text("gift_type").notNull(),
  createdAt: integer("created_at").notNull(),
});
