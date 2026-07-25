import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  emailVerifiedAt: integer("email_verified_at"),
  loginStreakCount: integer("login_streak_count").notNull().default(0),
  loginStreakLastCheckInDay: integer("login_streak_last_check_in_day"),
  loginStreakLastRewardedDay: integer("login_streak_last_rewarded_day"),
  loginStreakLastReminderDay: integer("login_streak_last_reminder_day"),
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
  personalityType: text("personality_type").notNull(),
  identity: text("identity").notNull(),
  lookingFor: text("looking_for").notNull(),
  bio: text("bio").notNull(),
  promptEntries: text("prompt_entries").notNull(),
  avatarPreset: text("avatar_preset").notNull(),
  boundaries: text("boundaries").notNull(),
  vibeTags: text("vibe_tags").notNull(),
  challengeCredits: integer("challenge_credits").notNull().default(0),
  starterCreditsGrantedAt: integer("starter_credits_granted_at"),
  verifiedHumanAt: integer("verified_human_at"),
  suspendedAt: integer("suspended_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const starterCreditGrants = sqliteTable("starter_credit_grants", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  installId: text("install_id"),
  ipAddress: text("ip_address"),
  grantedAt: integer("granted_at").notNull(),
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

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
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
  hiddenAtA: integer("hidden_at_a"),
  hiddenAtB: integer("hidden_at_b"),
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

export const boosts = sqliteTable("boosts", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  boostType: text("boost_type").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  buyerProfileId: text("buyer_profile_id")
    .notNull()
    .references(() => profiles.id),
  targetProfileId: text("target_profile_id").references(() => profiles.id),
  productKind: text("product_kind").notNull(),
  itemKey: text("item_key").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  fulfilledAt: integer("fulfilled_at"),
  createdAt: integer("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  actorProfileId: text("actor_profile_id")
    .notNull()
    .references(() => profiles.id),
  type: text("type").notNull(),
  giftType: text("gift_type"),
  challengeSessionId: text("challenge_session_id").references(() => challengeSessions.id),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
});

export const challengeSessions = sqliteTable("challenge_sessions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  senderProfileId: text("sender_profile_id")
    .notNull()
    .references(() => profiles.id),
  recipientProfileId: text("recipient_profile_id")
    .notNull()
    .references(() => profiles.id),
  questionSet: text("question_set").notNull(),
  expiresAt: integer("expires_at").notNull(),
  acceptedAt: integer("accepted_at"),
  declinedAt: integer("declined_at"),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const challengeResponses = sqliteTable("challenge_responses", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => challengeSessions.id),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  answers: text("answers").notNull(),
  score: integer("score").notNull(),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at").notNull(),
});

export const liveTriviaQueue = sqliteTable("live_trivia_queue", {
  profileId: text("profile_id")
    .primaryKey()
    .references(() => profiles.id),
  joinedAt: integer("joined_at").notNull(),
  heartbeatAt: integer("heartbeat_at").notNull(),
});

export const liveTriviaMatches = sqliteTable("live_trivia_matches", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  playerAId: text("player_a_id")
    .notNull()
    .references(() => profiles.id),
  playerBId: text("player_b_id")
    .notNull()
    .references(() => profiles.id),
  questionSet: text("question_set").notNull(),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at").notNull(),
  currentQuestionStartedAt: integer("current_question_started_at").notNull(),
  completedAt: integer("completed_at"),
  updatedAt: integer("updated_at").notNull(),
});

export const liveTriviaAnswers = sqliteTable("live_trivia_answers", {
  id: text("id").primaryKey(),
  matchId: text("match_id")
    .notNull()
    .references(() => liveTriviaMatches.id),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  questionIndex: integer("question_index").notNull(),
  answerIndex: integer("answer_index").notNull(),
  isCorrect: integer("is_correct").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const triviaQuestions = sqliteTable("trivia_questions", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  options: text("options").notNull(),
  correctAnswerIndex: integer("correct_answer_index").notNull(),
  difficulty: text("difficulty").notNull(),
  category: text("category").notNull(),
  source: text("source").notNull(),
  sourceNumericId: integer("source_numeric_id").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").references(() => profiles.id),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const pushDevices = sqliteTable("push_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  deviceLabel: text("device_label"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const eventLogs = sqliteTable("event_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  profileId: text("profile_id").references(() => profiles.id),
  eventType: text("event_type").notNull(),
  eventData: text("event_data").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const paymentWebhookEvents = sqliteTable("payment_webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  payload: text("payload").notNull(),
  processedAt: integer("processed_at"),
  createdAt: integer("created_at").notNull(),
});
