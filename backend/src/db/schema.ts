import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
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
  mobileProvider: text("mobile_provider"),
  mobilePurchaseToken: text("mobile_purchase_token"),
  mobilePackageName: text("mobile_package_name"),
  mobileProductId: text("mobile_product_id"),
  mobileOrderId: text("mobile_order_id"),
  mobilePurchaseState: integer("mobile_purchase_state"),
  mobileConsumptionState: integer("mobile_consumption_state"),
  mobileAcknowledgementState: integer("mobile_acknowledgement_state"),
  mobileVerifiedAt: integer("mobile_verified_at"),
  mobileConsumeStatus: text("mobile_consume_status"),
  mobileConsumeAttemptCount: integer("mobile_consume_attempt_count").notNull().default(0),
  mobileConsumeLastAttemptAt: integer("mobile_consume_last_attempt_at"),
  mobileConsumeLastError: text("mobile_consume_last_error"),
  mobileConsumedAt: integer("mobile_consumed_at"),
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

export const aiCompanions = sqliteTable("ai_companions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  identity: text("identity").notNull(),
  personaKey: text("persona_key").notNull(),
  traitsJson: text("traits_json").notNull(),
  backstory: text("backstory").notNull(),
  avatarKey: text("avatar_key").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionCanons = sqliteTable("ai_companion_canons", {
  companionId: text("companion_id").primaryKey().references(() => aiCompanions.id),
  factsJson: text("facts_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionAppearanceCatalog = sqliteTable("ai_companion_appearance_catalog", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  sourceCompanionId: text("source_companion_id").notNull(),
  lockedTraitsJson: text("locked_traits_json").notNull(),
  canonicalObjectKey: text("canonical_object_key").notNull(),
  referenceObjectKeysJson: text("reference_object_keys_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionVisualIdentities = sqliteTable("ai_companion_visual_identities", {
  companionId: text("companion_id").primaryKey().references(() => aiCompanions.id),
  appearanceCatalogId: text("appearance_catalog_id").references(() => aiCompanionAppearanceCatalog.id),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("pending_storage"),
  lockedTraitsJson: text("locked_traits_json").notNull(),
  canonicalObjectKey: text("canonical_object_key"),
  referenceObjectKeysJson: text("reference_object_keys_json").notNull().default("[]"),
  validationStatus: text("validation_status").notNull().default("pending"),
  validationNotes: text("validation_notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Casting options are intentionally separate from canonical references. A person is
// selected once, then every later reference and production photo is conditioned on it.
export const aiCompanionVisualCandidates = sqliteTable("ai_companion_visual_candidates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  visualIdentityVersion: integer("visual_identity_version").notNull(),
  objectKey: text("object_key").notNull(),
  prompt: text("prompt").notNull(),
  sortOrder: integer("sort_order").notNull(),
  status: text("status").notNull().default("candidate"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionConversations = sqliteTable("ai_companion_conversations", {
  id: text("id").primaryKey(),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  userId: text("user_id").notNull().references(() => users.id),
  trialRepliesUsed: integer("trial_replies_used").notNull().default(0),
  relationshipPoints: integer("relationship_points").notNull().default(0),
  relationshipStage: text("relationship_stage").notNull().default("new"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionMessages = sqliteTable("ai_companion_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => aiCompanionConversations.id),
  role: text("role").notNull(),
  body: text("body").notNull(),
  moderationStatus: text("moderation_status").notNull().default("allowed"),
  createdAt: integer("created_at").notNull(),
});

export const aiCompanionPhotos = sqliteTable("ai_companion_photos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  visualIdentityVersion: integer("visual_identity_version").notNull(),
  requestMessageId: text("request_message_id").references(() => aiCompanionMessages.id),
  photoAssetId: text("photo_asset_id"),
  sceneJson: text("scene_json").notNull(),
  prompt: text("prompt").notNull(),
  objectKey: text("object_key"),
  status: text("status").notNull().default("queued"),
  identityScore: real("identity_score"),
  validationStatus: text("validation_status").notNull().default("pending"),
  generationAttempt: integer("generation_attempt").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionVisualStates = sqliteTable("ai_companion_visual_states", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  conversationId: text("conversation_id").notNull().references(() => aiCompanionConversations.id),
  stateJson: text("state_json").notNull(),
  sourceMessageId: text("source_message_id").references(() => aiCompanionMessages.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionPhotoAssets = sqliteTable("ai_companion_photo_assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  appearanceCatalogId: text("appearance_catalog_id").references(() => aiCompanionAppearanceCatalog.id),
  visualIdentityVersion: integer("visual_identity_version").notNull(),
  objectKey: text("object_key").notNull(),
  sceneFingerprint: text("scene_fingerprint"),
  metadataJson: text("metadata_json").notNull(),
  generationSource: text("generation_source").notNull(),
  status: text("status").notNull().default("approved"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionPhotoDeliveries = sqliteTable("ai_companion_photo_deliveries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  photoAssetId: text("photo_asset_id").notNull().references(() => aiCompanionPhotoAssets.id),
  photoId: text("photo_id").references(() => aiCompanionPhotos.id),
  requestMessageId: text("request_message_id").references(() => aiCompanionMessages.id),
  billingPeriod: text("billing_period").notNull(),
  deliveredAt: integer("delivered_at").notNull(),
});

export const aiCompanionPhotoUsage = sqliteTable("ai_companion_photo_usage", {
  userId: text("user_id").notNull().references(() => users.id),
  billingPeriod: text("billing_period").notNull(),
  deliveredCount: integer("delivered_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionVoiceProfiles = sqliteTable("ai_companion_voice_profiles", {
  companionId: text("companion_id").primaryKey().references(() => aiCompanions.id),
  catalogName: text("catalog_name").notNull(),
  provider: text("provider").notNull(),
  engine: text("engine").notNull(),
  voiceName: text("voice_name").notNull(),
  locale: text("locale").notNull(),
  speakingRate: real("speaking_rate").notNull(),
  pitch: real("pitch").notNull(),
  audioEncoding: text("audio_encoding").notNull().default("MP3"),
  sampleRateHertz: integer("sample_rate_hertz").notNull().default(24000),
  profileVersion: integer("profile_version").notNull().default(1),
  status: text("status").notNull().default("locked"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionVoiceAssets = sqliteTable("ai_companion_voice_assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  conversationId: text("conversation_id").notNull().references(() => aiCompanionConversations.id),
  messageId: text("message_id").references(() => aiCompanionMessages.id),
  callId: text("call_id"),
  requestKey: text("request_key").notNull(),
  objectKey: text("object_key"),
  status: text("status").notNull().default("generating"),
  durationMs: integer("duration_ms"),
  characterCount: integer("character_count").notNull(),
  provider: text("provider").notNull(),
  profileVersion: integer("profile_version").notNull(),
  deliveryStyle: text("delivery_style").notNull().default("natural"),
  errorCode: text("error_code"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const aiCompanionVoiceUsage = sqliteTable("ai_companion_voice_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  scope: text("scope").notNull(),
  period: text("period").notNull(),
  reservedCount: integer("reserved_count").notNull().default(0),
  successfulCount: integer("successful_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionCalls = sqliteTable("ai_companion_calls", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  conversationId: text("conversation_id").notNull().references(() => aiCompanionConversations.id),
  status: text("status").notNull().default("calling"),
  connectedAt: integer("connected_at"),
  lastHeartbeatAt: integer("last_heartbeat_at"),
  endedAt: integer("ended_at"),
  billableSeconds: integer("billable_seconds").notNull().default(0),
  maxSeconds: integer("max_seconds").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionCallTurns = sqliteTable("ai_companion_call_turns", {
  id: text("id").primaryKey(),
  callId: text("call_id").notNull().references(() => aiCompanionCalls.id),
  userMessageId: text("user_message_id").references(() => aiCompanionMessages.id),
  assistantMessageId: text("assistant_message_id").references(() => aiCompanionMessages.id),
  voiceAssetId: text("voice_asset_id").references(() => aiCompanionVoiceAssets.id),
  transcript: text("transcript").notNull(),
  createdAt: integer("created_at").notNull(),
});

// User-owned shared photos are deliberately separate from companion visual
// identities and generated assets. They can never become catalog references.
export const aiCompanionUserPhotos = sqliteTable("ai_companion_user_photos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  objectKey: text("object_key"),
  status: text("status").notNull().default("quarantined"),
  contentType: text("content_type"),
  byteSize: integer("byte_size"),
  width: integer("width"),
  height: integer("height"),
  contentSha256: text("content_sha256"),
  moderationProvider: text("moderation_provider"),
  moderationReason: text("moderation_reason"),
  replacedById: text("replaced_by_id"),
  messageId: text("message_id").references(() => aiCompanionMessages.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const aiUserPhotoUploadDailyUsage = sqliteTable("ai_user_photo_upload_daily_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  dayNumber: integer("day_number").notNull(),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const aiUserPhotoUploadMonthlyUsage = sqliteTable("ai_user_photo_upload_monthly_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  billingPeriod: text("billing_period").notNull(),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionMemories = sqliteTable("ai_companion_memories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  pinned: integer("pinned").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiCompanionMemoryCandidates = sqliteTable("ai_companion_memory_candidates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  companionId: text("companion_id").notNull().references(() => aiCompanions.id),
  sourceMessageId: text("source_message_id").notNull().references(() => aiCompanionMessages.id),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
});

export const aiCompanionReports = sqliteTable("ai_companion_reports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  messageId: text("message_id").notNull().references(() => aiCompanionMessages.id),
  reason: text("reason").notNull(),
  details: text("details").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const aiEntitlements = sqliteTable("ai_entitlements", {
  userId: text("user_id").primaryKey().references(() => users.id),
  plan: text("plan").notNull().default("free"),
  source: text("source"),
  expiresAt: integer("expires_at"),
  messageLimit: integer("message_limit").notNull().default(15),
  photoLimit: integer("photo_limit").notNull().default(0),
  companionLimit: integer("companion_limit").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiTrialDailyUsage = sqliteTable("ai_trial_daily_usage", {
  dayNumber: integer("day_number").primaryKey(),
  repliesUsed: integer("replies_used").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
