import { apiBaseUrl } from "../config";

const authTokenStorageKey = "velora-auth-token";

async function adminRequest<T>(
  path: string,
  adminKey: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
) {
  const authToken =
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(authTokenStorageKey) ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-admin-key": adminKey,
  };

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
  let data: (T & { error?: string; message?: string }) | null = null;

  if (raw) {
    try {
      data = JSON.parse(raw) as T & { error?: string; message?: string };
    } catch {
      if (!response.ok) {
        throw new Error(raw || "Admin request failed.");
      }
    }
  }

  if (!response.ok) {
    throw new Error((data?.error ?? data?.message ?? raw) || "Admin request failed.");
  }

  return (data ?? {}) as T;
}

export type AdminReport = {
  id: string;
  reporterProfileId: string;
  targetProfileId: string;
  conversationId: string | null;
  reason: string;
  details: string;
  createdAt: number;
  targetProfile: {
    id: string;
    username: string;
    displayName: string;
    bio: string;
    promptEntries: Array<{ question: string; answer: string }>;
    challengeCredits: number;
    verifiedHumanAt: number | null;
    suspendedAt: number | null;
  } | null;
  reportCount: number;
  uniqueReporterCount: number;
  riskLevel: "low" | "watch" | "high";
};

export type AdminAiCompanionReport = {
  id: string;
  contentType: "response" | "photo";
  userId: string;
  userName: string | null;
  userEmail: string;
  companionId: string;
  companionName: string;
  contentId: string;
  content: string;
  reason: string;
  details: string;
  createdAt: number;
};

export type SupportTicket = {
  id: string;
  profileId: string | null;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: number;
};

export type AdminProfile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  promptEntries: Array<{ question: string; answer: string }>;
  challengeCredits: number;
  verifiedHumanAt: number | null;
  suspendedAt: number | null;
  createdAt?: number;
  email?: string;
};

export type AdminConversation = {
  id: string;
  createdAt: number;
  participants: Array<
    | {
        id: string;
        username: string;
        displayName: string;
      }
    | null
  >;
  messages: Array<{
    id: string;
    senderProfileId: string;
    body: string;
    createdAt: number;
    sender:
      | {
          id: string;
          username: string;
          displayName: string;
        }
      | null;
  }>;
};

export type EngagementPeriod = {
  activeUsers: number;
  messagesSent: number;
  uniqueMessageSenders: number;
  activeConversations: number;
  newConversations: number;
  averageMessagesPerActiveConversation: number;
  medianMessagesPerActiveConversation: number;
  conversationsWith2PlusMessages: number;
  conversationsWith5PlusMessages: number;
  conversationsWith10PlusMessages: number;
  oneSidedConversations: number;
  twoWayConversations: number;
  replyRate: number;
  topConversations: Array<{
    conversationId: string;
    messageCount: number;
    createdAt: number;
    lastMessageAt: number;
    profileADisplayName: string;
    profileAUsername: string;
    profileBDisplayName: string;
    profileBUsername: string;
  }>;
};

export type SignupFunnelPeriod = {
  signups: number;
  profilesCreated: number;
  usersStartedConversation: number;
  usersSentMessage: number;
  usersReceivedReply: number;
};

export type RetentionPeriod = {
  day: number;
  eligibleUsers: number;
  retainedUsers: number;
  retentionRate: number;
};

export type DailyTrendPoint = {
  day: string;
  signups: number;
  profilesCreated: number;
  activeUsers: number;
  messagesSent: number;
  conversationsStarted: number;
  twoWayConversations: number;
};

export type GooglePlayBillingSummary = {
  verifiedPurchases: number;
  fulfilledPurchases: number;
  consumedPurchases: number;
  pendingConsumption: number;
  failedConsumption: number;
  atRiskPurchases: number;
  legacyUntrackedPurchases: number;
  revenueUsdCents: number;
};

export type GooglePlayBillingPurchase = {
  id: string;
  externalPaymentId: string;
  buyerDisplayName: string;
  buyerUsername: string;
  targetDisplayName: string | null;
  targetUsername: string | null;
  productKind: string;
  itemKey: string;
  amountCents: number;
  status: string;
  createdAt: number;
  fulfilledAt: number | null;
  mobileProductId: string | null;
  mobileOrderId: string | null;
  mobilePurchaseState: number | null;
  mobileConsumptionState: number | null;
  mobileAcknowledgementState: number | null;
  mobileConsumeStatus: string | null;
  mobileConsumeAttemptCount: number;
  mobileConsumeLastError: string | null;
  mobileConsumedAt: number | null;
  isLegacyUntracked: number;
};

export type StarterCreditEligibleUser = {
  profileId: string | null;
  userId: string;
  email: string;
  name: string | null;
  username: string | null;
  displayName: string | null;
  challengeCredits: number;
  userCreatedAt: number;
  lastEmailSentAt: number | null;
};

export type AdminAnalytics = {
  overview: {
    totalUsers: number;
    totalProfiles: number;
    verifiedProfiles: number;
    openSupportTickets: number;
    totalReports: number;
    activeBoosts: number;
    fulfilledPurchases: number;
    revenueUsdCents: number;
  };
  funnelLast7d: {
    signups: number;
    profilesCreated: number;
    conversationsStarted: number;
    giftsPurchased: number;
    boostsPurchased: number;
    passwordResetRequests: number;
    revenueUsdCents: number;
  };
  engagement: {
    last7d: EngagementPeriod;
    last30d: EngagementPeriod;
  };
  signupFunnels: {
    last7d: SignupFunnelPeriod;
    last30d: SignupFunnelPeriod;
  };
  retention: RetentionPeriod[];
  dailyTrends: DailyTrendPoint[];
  googlePlayBilling: {
    summary: GooglePlayBillingSummary;
    recentPurchases: GooglePlayBillingPurchase[];
  };
  aiCompanionPhotoGeneration: {
    billingPeriod: string;
    freeLifetimeLimit: number;
    proDailyLimit: number;
    ultraDailyLimit: number;
    attempts: number;
    estimatedSpendCents: number;
    spendCeilingCents: number;
    remainingCents: number;
    paused: boolean;
  };
  topProfiles: Array<{
    id: string;
    username: string;
    displayName: string;
    favoritesReceived: number;
    giftsReceived: number;
    reportsReceived: number;
    activeBoostCount: number;
    purchaseRevenueCents: number;
  }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    createdAt: number;
    profile: {
      id: string;
      username: string;
      displayName: string;
    } | null;
    targetProfile: {
      id: string;
      username: string;
      displayName: string;
    } | null;
    data: Record<string, unknown>;
  }>;
};

export function fetchAdminAnalytics(adminKey: string) {
  return adminRequest<AdminAnalytics>("/api/admin/analytics", adminKey);
}

export function fetchAdminReports(adminKey: string) {
  return adminRequest<{ reports: AdminReport[] }>("/api/admin/reports", adminKey);
}

export function fetchAdminAiCompanionReports(adminKey: string) {
  return adminRequest<{ reports: AdminAiCompanionReport[] }>("/api/admin/ai-companion-reports", adminKey);
}

export function suspendProfile(adminKey: string, profileId: string) {
  return adminRequest<{ ok: true }>(
    `/api/admin/profiles/${profileId}/suspend`,
    adminKey,
    { method: "POST" },
  );
}

export function unsuspendProfile(adminKey: string, profileId: string) {
  return adminRequest<{ ok: true }>(
    `/api/admin/profiles/${profileId}/unsuspend`,
    adminKey,
    { method: "POST" },
  );
}

export function fetchSupportTickets(adminKey: string) {
  return adminRequest<{ tickets: SupportTicket[] }>("/api/admin/support-tickets", adminKey);
}

export function fetchStarterCreditEligibleUsers(adminKey: string) {
  return adminRequest<{ users: StarterCreditEligibleUser[] }>(
    "/api/admin/starter-credit-eligible-users",
    adminKey,
  );
}

export function sendStarterCreditEmailBatch(
  adminKey: string,
  payload: {
    userIds: string[];
    subject: string;
    message: string;
  },
) {
  return adminRequest<{ ok: true; sentCount: number; skippedCount: number }>(
    "/api/admin/starter-credit-eligible-users/send-email",
    adminKey,
    {
      method: "POST",
      body: payload,
    },
  );
}

export function replyToSupportTicket(
  adminKey: string,
  ticketId: string,
  payload: {
    subject: string;
    message: string;
  },
) {
  return adminRequest<{ ok: true }>(
    `/api/admin/support-tickets/${ticketId}/reply`,
    adminKey,
    {
      method: "POST",
      body: payload,
    },
  );
}

export function fetchAdminProfileByUsername(adminKey: string, username: string) {
  return adminRequest<{ profile: AdminProfile }>(
    `/api/admin/profiles/by-username/${encodeURIComponent(username.trim().toLowerCase())}`,
    adminKey,
  );
}

export function fetchAdminConversation(adminKey: string, conversationId: string) {
  return adminRequest<{ conversation: AdminConversation }>(
    `/api/admin/conversations/${conversationId}`,
    adminKey,
  );
}

export function verifyProfile(adminKey: string, profileId: string) {
  return adminRequest<{ ok: true }>(
    `/api/admin/profiles/${profileId}/verify`,
    adminKey,
    { method: "POST" },
  );
}

export function unverifyProfile(adminKey: string, profileId: string) {
  return adminRequest<{ ok: true }>(
    `/api/admin/profiles/${profileId}/unverify`,
    adminKey,
    { method: "POST" },
  );
}

export function updateProfileContent(
  adminKey: string,
  profileId: string,
  payload: {
    bio: string;
    promptEntries: Array<{ question: string; answer: string }>;
  },
) {
  return adminRequest<{
    ok: true;
    profile: {
      id: string;
      username: string;
      displayName: string;
      bio: string;
      promptEntries: Array<{ question: string; answer: string }>;
      challengeCredits: number;
      verifiedHumanAt: number | null;
      suspendedAt: number | null;
    };
  }>(`/api/admin/profiles/${profileId}/content`, adminKey, {
    method: "POST",
    body: payload,
  });
}

export function grantFounderCredits(
  adminKey: string,
  profileId: string,
  credits: number,
) {
  return adminRequest<{
    ok: true;
    profile: AdminProfile;
  }>(`/api/admin/profiles/${profileId}/grant-credits`, adminKey, {
    method: "POST",
    body: { credits },
  });
}

export function sendFounderGift(
  adminKey: string,
  profileId: string,
  giftType: "rose" | "starlight" | "crown",
) {
  return adminRequest<{
    ok: true;
    profile: AdminProfile;
  }>(`/api/admin/profiles/${profileId}/send-free-gift`, adminKey, {
    method: "POST",
    body: { giftType },
  });
}
