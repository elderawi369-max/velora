import { apiBaseUrl } from "../config";

const authTokenStorageKey = "velora-auth-token";

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

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
    },
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
  createdAt: number;
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
  } | null;
  isFavorited: boolean;
  lastMessageAt: number;
  lastMessagePreview: string;
  unread: boolean;
  unreadCount: number;
  createdAt: number;
};

export type NotificationItem = {
  id: string;
  type: "favorite" | "gift";
  giftType: string | null;
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

export function fetchSession() {
  return request<{
    authenticated: boolean;
    user: { id: string; email: string; emailVerified: boolean } | null;
    hasProfile: boolean;
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

export function fetchProfiles() {
  return request<{ profiles: PublicProfile[] }>("/api/profiles");
}

export function fetchOwnProfile() {
  return request<{ profile: PublicProfile | null }>("/api/profiles/me");
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
