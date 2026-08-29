import { Capacitor } from "@capacitor/core";
import { apiBaseUrl } from "../config";

const authTokenStorageKey = "velora-auth-token";
const installIdStorageKey = "velora-install-id";

function getAuthToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(authTokenStorageKey) ?? "";
}

export function saveAuthToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(authTokenStorageKey, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(authTokenStorageKey);
}

export function hasStoredAuthToken() {
  return Boolean(getAuthToken());
}

function getInstallId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(installIdStorageKey) ?? "";
  if (existing) {
    return existing;
  }

  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `velora-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(installIdStorageKey, next);
  return next;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

function getClientPlatformHeaders() {
  const headers: Record<string, string> = {};

  if (
    Capacitor.getPlatform() === "android" &&
    Capacitor.isNativePlatform()
  ) {
    headers["X-Velora-Client-Platform"] = "android-native";
  }

  const installId = getInstallId();
  if (installId) {
    headers["X-Velora-Install-Id"] = installId;
  }

  return headers;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getClientPlatformHeaders(),
  };

  const authToken = getAuthToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  let data: (T & { error?: string }) | null = null;

  if (raw) {
    try {
      data = JSON.parse(raw) as T & { error?: string };
    } catch {
      if (!response.ok) {
        throw new Error("Server error. Please try again.");
      }
    }
  }

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed.");
  }

  return (data ?? {}) as T;
}

export type SignupPayload = {
  email: string;
  password: string;
  turnstileToken: string;
  ageConfirmed: boolean;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type ForgotPasswordPayload = {
  email: string;
  turnstileToken: string;
};

export type ResetPasswordPayload = {
  token: string;
  newPassword: string;
};

export type ProfilePayload = {
  username: string;
  displayName: string;
  personalityType: string;
  identity: string;
  lookingFor: string;
  bio: string;
  promptEntries: Array<{ question: string; answer: string }>;
  avatarPreset: string;
  vibeTags: string[];
  boundaries: string[];
};

export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  personalityType: string;
  identity: string;
  lookingFor: string;
  bio: string;
  promptEntries: Array<{ question: string; answer: string }>;
  avatarPreset: string;
  vibeTags: string[];
  boundaries: string[];
  isFavorited: boolean;
  recommended: boolean;
  compatibilityScore: number;
  matchReasons: string[];
  trustLevel: "new" | "established" | "trusted";
  verifiedHuman: boolean;
  emailVerified: boolean;
  trustSignals: string[];
  activityBadge?: string | null;
  giftEffect: {
    dominantGiftType: "rose" | "starlight" | "crown" | null;
    totalReceived: number;
    activeLabel: string | null;
    activeExpiresAt: number | null;
    remainingMs: number;
    activeCount: number;
  };
  boostEffect: {
    activeBoostType: "spark" | "spotlight" | null;
    activeLabel: string | null;
    activeExpiresAt: number | null;
    remainingMs: number;
    totalPurchased: number;
  };
  challengeCredits: number;
  createdAt: number;
};

export type BrowseProfilesParams = {
  limit?: number;
  cursor?: string | null;
  searchTerm?: string;
  selectedVibe?: string;
  selectedPreference?: string;
  selectedIdentity?: string;
  selectedPersonalityType?: string;
  selectedLookingFor?: string;
  activeNowOnly?: boolean;
  sortMode?: "recommended" | "newest" | "name" | "favorited";
  favoritesOnly?: boolean;
  recommendedOnly?: boolean;
};

export type BrowseProfilesResponse = {
  profiles: PublicProfile[];
  nextCursor: string | null;
  hasMore: boolean;
  totalProfiles: number;
  filteredCount: number;
};

export type SupportTicketPayload = {
  email: string;
  subject: string;
  message: string;
  turnstileToken: string;
};

export type Conversation = {
  id: string;
  otherProfile: {
    id: string;
    username: string;
    displayName: string;
    personalityType: string;
    identity: string;
    avatarPreset: string;
    bio?: string;
    vibeTags?: string[];
    promptEntries?: Array<{ question: string; answer: string }>;
  } | null;
  isFavorited: boolean;
  lastMessageAt: number;
  lastMessagePreview: string;
  unread: boolean;
  unreadCount: number;
  awaitingReply?: boolean;
  needsTheirReply?: boolean;
  createdAt: number;
};

export type NotificationItem = {
  id: string;
  type:
    | "favorite"
    | "gift"
    | "challenge"
    | "challenge_result"
    | "starter_credit_reward"
    | "streak_reward";
  giftType: string | null;
  challengeSessionId?: string | null;
  readAt: number | null;
  createdAt: number;
  actorProfile: {
    id: string;
    username: string;
    displayName: string;
    personalityType: string;
    identity: string;
    avatarPreset: string;
  };
};

export type Message = {
  id: string;
  conversationId: string;
  senderProfileId: string;
  body: string;
  createdAt: number;
};

export type ChallengeListItem = {
  id: string;
  type: "compatibility" | "trivia";
  typeLabel: string;
  status: "pending" | "accepted" | "canceled" | "declined" | "completed" | "expired";
  isSender: boolean;
  otherProfile: {
    id: string;
    username: string;
    displayName: string;
    personalityType: string;
    identity: string;
    avatarPreset: string;
  } | null;
  expiresAt: number;
  createdAt: number;
  completedAt: number | null;
};

export type ChallengeCreditPack = {
  key: string;
  label: string;
  credits: number;
  priceCents: number;
};

export type ChallengeDetail = {
  id: string;
  type: "compatibility" | "trivia";
  typeLabel: string;
  status: "pending" | "accepted" | "canceled" | "declined" | "completed" | "expired";
  isSender: boolean;
  isRecipient: boolean;
  otherProfile: {
    id: string;
    username: string;
    displayName: string;
    personalityType: string;
    identity: string;
    avatarPreset: string;
  } | null;
  questions: Array<{
    id: string;
    prompt: string;
    options: string[];
    category?: string | null;
  }>;
  expiresAt: number;
  createdAt: number;
  acceptedAt: number | null;
  completedAt: number | null;
  ownResponse: {
    answers: number[];
    score: number;
    completedAt: number;
  } | null;
  otherParticipantCompleted: boolean;
  result: {
    compatibilityPercent: number;
    matchedCount: number;
    matchedPrompts: Array<{ questionId: string; prompt: string; answer: string }>;
    mismatchedPrompts: Array<{
      questionId: string;
      prompt: string;
      senderAnswer: string;
      recipientAnswer: string;
    }>;
    senderScore?: never;
  } | {
    senderScore: number;
    recipientScore: number;
    maxScore: number;
    winner: "sender" | "recipient" | "tie";
    correctAnswers: Array<{
      questionId: string;
      prompt: string;
      answer: string;
      category: string;
    }>;
    compatibilityPercent?: never;
  } | null;
};

export type LiveTriviaStatus = {
  activePlayerCount: number;
  creditBalance: number;
  onlineProfiles: Array<{
    id: string;
    username: string;
    displayName: string;
    personalityType: string;
    identity: string;
    avatarPreset: string;
  }>;
  queued: boolean;
  queueJoinedAt: number | null;
  match: {
    id: string;
    status: "pending" | "active" | "completed" | "abandoned" | "dismissed";
    isInviter: boolean;
    isInviteRecipient: boolean;
    createdAt: number;
    startedAt: number;
    completedAt: number | null;
    updatedAt: number;
    otherProfile: {
      id: string;
      username: string;
      displayName: string;
      personalityType: string;
      identity: string;
      avatarPreset: string;
    } | null;
      questionCount: number;
      currentQuestionIndex: number;
      currentQuestion: {
        id: string;
        prompt: string;
        options: string[];
        category: string;
      } | null;
      roundDurationMs: number | null;
      roundDeadlineAt: number | null;
      ownAnsweredCount: number;
      otherAnsweredCount: number;
      ownScore: number;
      otherScore: number;
      finished: boolean;
    winner: "you" | "other" | "tie" | null;
    correctAnswers: Array<{
      questionId: string;
      prompt: string;
      answer: string;
      category: string;
    }>;
  } | null;
};

export function signup(payload: SignupPayload) {
  return request<{ user: { id: string; email: string; emailVerified: boolean }; sessionToken: string; hasProfile: boolean }>("/api/auth/signup", {
    method: "POST",
    body: payload,
  });
}

export function login(payload: LoginPayload) {
  return request<{ user: { id: string; email: string; emailVerified: boolean }; sessionToken: string; hasProfile: boolean }>("/api/auth/login", {
    method: "POST",
    body: payload,
  });
}

async function requestImageUrl(path: string): Promise<string> {
  const headers: Record<string, string> = getClientPlatformHeaders();
  const authToken = getAuthToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", headers });
  if (!response.ok) throw new Error("Could not load the private visual reference.");
  return URL.createObjectURL(await response.blob());
}

export function requestPasswordReset(payload: ForgotPasswordPayload) {
  return request<{ ok: true; delivery: string; message: string }>("/api/auth/forgot-password", {
    method: "POST",
    body: payload,
  });
}

export function resetPassword(payload: ResetPasswordPayload) {
  return request<{ ok: true }>("/api/auth/reset-password", {
    method: "POST",
    body: payload,
  });
}

export function fetchSession() {
  return request<{
    authenticated: boolean;
    user: { id: string; email: string; emailVerified: boolean } | null;
    hasProfile: boolean;
    starterCreditGrant: { credits: number; grantedAt: number } | null;
    loginStreak: {
      currentDays: number;
      targetDays: number;
      daysRemaining: number;
      checkedInToday: boolean;
      rewardCredits: number;
      rewardEarnedToday: boolean;
    } | null;
    loginStreakRewardGrant: {
      credits: number;
      grantedAt: number;
      streakDays: number;
    } | null;
  }>("/api/auth/me");
}

export function logout() {
  return request<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  return request<{ ok: true }>("/api/auth/change-password", {
    method: "POST",
    body: payload,
  });
}

export function deleteAccount(payload: {
  currentPassword: string;
  confirmationText: "DELETE";
}) {
  return request<{ ok: true }>("/api/auth/account", {
    method: "DELETE",
    body: payload,
  });
}

export function createProfile(payload: ProfilePayload) {
  return request<{ profile: PublicProfile }>("/api/profiles", {
    method: "POST",
    body: payload,
  });
}

export function updateOwnProfile(payload: ProfilePayload) {
  return request<{ profile: PublicProfile }>("/api/profiles/me", {
    method: "PUT",
    body: payload,
  });
}

export function fetchProfiles(params: BrowseProfilesParams = {}) {
  const search = new URLSearchParams();

  if (params.limit) {
    search.set("limit", String(params.limit));
  }
  if (params.cursor) {
    search.set("cursor", params.cursor);
  }
  if (params.searchTerm) {
    search.set("searchTerm", params.searchTerm);
  }
  if (params.selectedVibe) {
    search.set("selectedVibe", params.selectedVibe);
  }
  if (params.selectedPreference) {
    search.set("selectedPreference", params.selectedPreference);
  }
  if (params.selectedIdentity) {
    search.set("selectedIdentity", params.selectedIdentity);
  }
  if (params.selectedPersonalityType) {
    search.set("selectedPersonalityType", params.selectedPersonalityType);
  }
  if (params.selectedLookingFor) {
    search.set("selectedLookingFor", params.selectedLookingFor);
  }
  if (typeof params.activeNowOnly === "boolean") {
    search.set("activeNowOnly", String(params.activeNowOnly));
  }
  if (params.sortMode) {
    search.set("sortMode", params.sortMode);
  }
  if (typeof params.favoritesOnly === "boolean") {
    search.set("favoritesOnly", String(params.favoritesOnly));
  }
  if (typeof params.recommendedOnly === "boolean") {
    search.set("recommendedOnly", String(params.recommendedOnly));
  }

  const query = search.toString();
  return request<BrowseProfilesResponse>(`/api/profiles${query ? `?${query}` : ""}`);
}

export function fetchOwnProfile() {
  return request<{ profile: PublicProfile | null }>("/api/profiles/me");
}

export function fetchProfileByUsername(username: string) {
  return request<{ profile: PublicProfile }>(`/api/profiles/${username}`);
}

export function createConversation(targetProfileId: string) {
  return request<{ conversation: Conversation }>("/api/chat/conversations", {
    method: "POST",
    body: { targetProfileId },
  });
}

export function fetchConversations() {
  return request<{ conversations: Conversation[] }>("/api/chat/conversations");
}

export function fetchMessages(conversationId: string) {
  return request<{ messages: Message[]; ownProfileId: string }>(
    `/api/chat/conversations/${conversationId}/messages`,
  );
}

export function sendMessage(conversationId: string, body: string) {
  return request<{ message: Message }>(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: { body },
    },
  );
}

export function fetchConversation(conversationId: string) {
  return request<{ conversation: Conversation }>(
    `/api/chat/conversations/${conversationId}`,
  );
}

export function deleteConversation(conversationId: string) {
  return request<{ ok: true }>(`/api/chat/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function fetchNotifications() {
  return request<{ notifications: NotificationItem[] }>("/api/notifications");
}

export function markNotificationRead(notificationId: string) {
  return request<{ ok: true }>(`/api/notifications/${notificationId}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead() {
  return request<{ ok: true }>("/api/notifications/read-all", {
    method: "POST",
  });
}

export function fetchFavorites() {
  return request<{
    favorites: Array<{
      id: string;
      targetProfileId: string;
      createdAt: number;
      username: string;
      displayName: string;
      personalityType: string;
      identity: string;
      avatarPreset: string;
    }>;
  }>("/api/social/favorites");
}

export function addFavorite(targetProfileId: string) {
  return request<{ ok: true }>(`/api/social/favorites/${targetProfileId}`, {
    method: "POST",
  });
}

export function removeFavorite(targetProfileId: string) {
  return request<{ ok: true }>(`/api/social/favorites/${targetProfileId}`, {
    method: "DELETE" as never,
  });
}

export function fetchGiftCatalog() {
  return request<{ gifts: Array<{ key: string; label: string; priceCents: number }> }>(
    "/api/social/gifts/catalog",
  );
}

export function fetchBoostCatalog() {
  return request<{
    boosts: Array<{ key: string; label: string; durationHours: number; priceCents: number }>;
  }>("/api/social/boosts/catalog");
}

export function fetchChallengeCreditCatalog() {
  return request<{ packs: ChallengeCreditPack[] }>("/api/social/challenge-credits/catalog");
}

const pendingCheckoutStorageKey = "velora-pending-checkout";

export function savePendingCheckoutId(checkoutId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(pendingCheckoutStorageKey, checkoutId);
}

export function getPendingCheckoutId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(pendingCheckoutStorageKey) ?? "";
}

export function clearPendingCheckoutId() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(pendingCheckoutStorageKey);
}

export function createGiftCheckout(targetProfileId: string, giftType: string) {
  return request<{ checkoutUrl: string; checkoutId: string }>("/api/payments/checkout", {
    method: "POST",
    body: { productKind: "gift", targetProfileId, itemKey: giftType },
  });
}

export function createBoostCheckout(boostType: string) {
  return request<{ checkoutUrl: string; checkoutId: string }>("/api/payments/checkout", {
    method: "POST",
    body: { productKind: "boost", itemKey: boostType },
  });
}

export function createChallengeCreditCheckout(packKey: string) {
  return request<{ checkoutUrl: string; checkoutId: string }>("/api/payments/checkout", {
    method: "POST",
    body: { productKind: "challenge_credit_pack", itemKey: packKey },
  });
}

export function verifyGoogleMobilePurchase(payload: {
  provider: "google";
  productKind: "gift" | "boost" | "challenge_credit_pack";
  itemKey: string;
  targetProfileId?: string;
  purchaseToken: string;
  packageName: string;
  productId: string;
  orderId?: string;
}) {
  return request<{
    ok: true;
    purchase: { id: string; productKind: string; itemKey: string; status: string };
    googlePlay?: {
      purchaseState: number | null;
      consumptionState: number | null;
      acknowledgementState: number | null;
      consumeStatus: string;
      consumeError: string | null;
    };
  }>("/api/payments/mobile/verify/google", {
    method: "POST",
    body: payload,
  });
}

export function fetchChallenges() {
  return request<{ challenges: ChallengeListItem[]; creditBalance: number }>("/api/challenges");
}

export function createChallenge(payload: {
  targetProfileId: string;
  type: "compatibility" | "trivia";
}) {
  return request<{ challenge: ChallengeDetail }>("/api/challenges", {
    method: "POST",
    body: payload,
  });
}

export function fetchChallenge(challengeId: string) {
  return request<{ challenge: ChallengeDetail }>(`/api/challenges/${challengeId}`);
}

export function acceptChallenge(challengeId: string) {
  return request<{ ok: true; challenge: ChallengeDetail }>(
    `/api/challenges/${challengeId}/accept`,
    {
      method: "POST",
    },
  );
}

export function declineChallenge(challengeId: string) {
  return request<{ ok: true }>(`/api/challenges/${challengeId}/decline`, {
    method: "POST",
  });
}

export function cancelChallenge(challengeId: string) {
  return request<{ ok: true }>(`/api/challenges/${challengeId}/cancel`, {
    method: "POST",
  });
}

export function submitChallengeAnswers(challengeId: string, answers: number[]) {
  return request<{ challenge: ChallengeDetail }>(`/api/challenges/${challengeId}/submit`, {
    method: "POST",
    body: { answers },
  });
}

export function fetchLiveTriviaStatus() {
  return request<LiveTriviaStatus>("/api/live-trivia/status");
}

export function joinLiveTriviaQueue() {
  return request<LiveTriviaStatus>("/api/live-trivia/queue", {
    method: "POST",
  });
}

export function createDirectLiveTriviaMatch(targetProfileId: string) {
  return request<LiveTriviaStatus>("/api/live-trivia/match", {
    method: "POST",
    body: { targetProfileId },
  });
}

export function leaveLiveTriviaQueue() {
  return request<LiveTriviaStatus>("/api/live-trivia/leave", {
    method: "POST",
  });
}

export function submitLiveTriviaAnswer(
  matchId: string,
  payload: { questionIndex: number; answerIndex: number },
) {
  return request<{ match: LiveTriviaStatus["match"] }>(
    `/api/live-trivia/matches/${matchId}/answer`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export function leaveLiveTriviaMatch(matchId: string) {
  return request<LiveTriviaStatus>(`/api/live-trivia/matches/${matchId}/leave`, {
    method: "POST",
  });
}

export function acceptLiveTriviaMatch(matchId: string) {
  return request<LiveTriviaStatus>(`/api/live-trivia/matches/${matchId}/accept`, {
    method: "POST",
  });
}

export function declineLiveTriviaMatch(matchId: string) {
  return request<LiveTriviaStatus>(`/api/live-trivia/matches/${matchId}/decline`, {
    method: "POST",
  });
}

export function completeCheckoutSession(sessionId: string) {
  return request<{
    ok: true;
    purchase: { id: string; productKind: string; itemKey: string; status: string };
  }>("/api/payments/checkout/complete", {
    method: "POST",
    body: { sessionId },
  });
}

export function reportProfile(payload: {
  targetProfileId: string;
  conversationId?: string;
  reason: string;
  details?: string;
}) {
  return request<{ ok: true }>("/api/safety/reports", {
    method: "POST",
    body: payload,
  });
}

export function blockProfile(targetProfileId: string) {
  return request<{ ok: true }>("/api/safety/blocks", {
    method: "POST",
    body: { targetProfileId },
  });
}

export function fetchBlocks() {
  return request<{
    blocks: Array<{
      id: string;
      targetProfileId: string;
      createdAt: number;
      username?: string;
      displayName?: string;
      personalityType?: string;
      identity?: string;
      avatarPreset?: string;
    }>;
  }>("/api/safety/blocks");
}

export function unblockProfile(targetProfileId: string) {
  return request<{ ok: true }>(`/api/safety/blocks/${targetProfileId}`, {
    method: "DELETE",
  });
}

export function submitSupportTicket(payload: SupportTicketPayload) {
  return request<{ ok: true }>("/api/support/tickets", {
    method: "POST",
    body: payload,
  });
}

export function registerPushToken(payload: {
  token: string;
  platform: "web" | "android";
  deviceLabel?: string;
}) {
  return request<{ ok: true }>("/api/push/register", {
    method: "POST",
    body: payload,
  });
}

export function unregisterPushToken(token: string) {
  return request<{ ok: true }>("/api/push/unregister", {
    method: "POST",
    body: { token },
  });
}

export type AiCompanion = {
  id: string;
  name: string;
  identity: "woman" | "man";
  personaKey: string;
  traitsJson: string;
  backstory: string;
  avatarKey: string;
  createdAt: number;
  updatedAt: number;
};

export type AiEntitlement = {
  plan: "free" | "pro" | "ultra";
  messageLimit: number;
  photoLimit: number;
  companionLimit: number;
};

export type AiCompanionMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  moderationStatus: string;
  createdAt: number;
};

export type AiCompanionMemory = {
  id: string;
  content: string;
  kind: string;
  pinned: number;
  createdAt: number;
};

export type AiCompanionMemoryCandidate = {
  id: string;
  kind: string;
  content: string;
  status: "pending" | "approved" | "dismissed";
  createdAt: number;
};

export type AiCompanionVisualIdentity = {
  version: number;
  status: "pending_storage" | "generating" | "review" | "ready" | "failed";
  validationStatus: "pending" | "manual_review" | "approved" | "failed";
  validationNotes: string | null;
};

export function fetchAiCompanions() {
  return request<{ companions: AiCompanion[]; entitlement: AiEntitlement; aiEnabled: boolean; trialReplies: number }>("/api/ai-companions");
}

export function createAiCompanion(payload: {
  name: string;
  identity: "woman" | "man";
  personaKey: string;
  traits: { warmth: number; playfulness: number; directness: number; replyStyle: "short" | "natural" | "detailed" };
  backstory: string;
  avatarKey: string;
}) {
  return request<{ companion: AiCompanion }>("/api/ai-companions", { method: "POST", body: payload });
}

export function fetchAiCompanion(companionId: string) {
  return request<{
    companion: AiCompanion;
    conversation: { id: string; trialRepliesUsed: number; relationshipPoints: number; relationshipStage: "new" | "familiar" | "established" };
    messages: AiCompanionMessage[];
    memories: AiCompanionMemory[];
    memoryCandidates: AiCompanionMemoryCandidate[];
    visualIdentity: AiCompanionVisualIdentity | null;
    photos: Array<{ id: string; status: string; createdAt: number }>;
    entitlement: AiEntitlement;
    aiEnabled: boolean;
  }>(`/api/ai-companions/${companionId}`);
}

export function prepareAiCompanionVisualIdentity(companionId: string) {
  return request<{ visualIdentity: AiCompanionVisualIdentity }>(`/api/ai-companions/${companionId}/visual-identity`, { method: "POST" });
}

export function fetchAiCompanionVisualIdentityPreview(companionId: string, view: "canonical" | "three-quarter" | "side") {
  return requestImageUrl(`/api/ai-companions/${companionId}/visual-identity/images/${view}`);
}

export function sendAiCompanionMessage(companionId: string, body: string) {
  return request<{ userMessage: AiCompanionMessage; assistantMessage: AiCompanionMessage; trialRepliesUsed: number }>(`/api/ai-companions/${companionId}/messages`, { method: "POST", body: { body } });
}

export function createAiCompanionMemory(companionId: string, content: string) {
  return request<{ memory: AiCompanionMemory }>(`/api/ai-companions/${companionId}/memories`, { method: "POST", body: { content } });
}

export function deleteAiCompanionMemory(companionId: string, memoryId: string) {
  return request<{ ok: true }>(`/api/ai-companions/${companionId}/memories/${memoryId}`, { method: "DELETE" });
}

export function approveAiCompanionMemoryCandidate(companionId: string, candidateId: string) {
  return request<{ memory: AiCompanionMemory }>(`/api/ai-companions/${companionId}/memory-candidates/${candidateId}/approve`, { method: "POST" });
}

export function dismissAiCompanionMemoryCandidate(companionId: string, candidateId: string) {
  return request<{ ok: true }>(`/api/ai-companions/${companionId}/memory-candidates/${candidateId}/dismiss`, { method: "POST" });
}

export function reportAiCompanionMessage(messageId: string, payload: { reason: "unsafe" | "harmful" | "sexual_content" | "misleading" | "other"; details?: string }) {
  return request<{ ok: true }>(`/api/ai-companions/messages/${messageId}/report`, { method: "POST", body: payload });
}
