import { apiBaseUrl } from "../config";

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }

  return data;
}

export type SignupPayload = {
  email: string;
  password: string;
};

export type ProfilePayload = {
  username: string;
  displayName: string;
  bio: string;
  avatarPreset: string;
  vibeTags: string[];
  boundaries: string[];
};

export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarPreset: string;
  vibeTags: string[];
  boundaries: string[];
  isFavorited: boolean;
  createdAt: number;
};

export type Conversation = {
  id: string;
  otherProfile: {
    id: string;
    username: string;
    displayName: string;
    avatarPreset: string;
  } | null;
  isFavorited: boolean;
  lastMessageAt: number;
  createdAt: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderProfileId: string;
  body: string;
  createdAt: number;
};

export function signup(payload: SignupPayload) {
  return request<{ user: { id: string; email: string } }>("/api/auth/signup", {
    method: "POST",
    body: payload,
  });
}

export function login(payload: SignupPayload) {
  return request<{ user: { id: string; email: string } }>("/api/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function createProfile(payload: ProfilePayload) {
  return request<{ profile: PublicProfile }>("/api/profiles", {
    method: "POST",
    body: payload,
  });
}

export function fetchProfiles() {
  return request<{ profiles: PublicProfile[] }>("/api/profiles");
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

export function fetchFavorites() {
  return request<{
    favorites: Array<{
      id: string;
      targetProfileId: string;
      createdAt: number;
      username: string;
      displayName: string;
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
  return request<{ gifts: Array<{ key: string; label: string }> }>(
    "/api/social/gifts/catalog",
  );
}

export function sendGift(targetProfileId: string, giftType: string) {
  return request<{ ok: true }>("/api/social/gifts/send", {
    method: "POST",
    body: { targetProfileId, giftType },
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
