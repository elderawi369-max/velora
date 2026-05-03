import { apiBaseUrl } from "../config";

async function adminRequest<T>(
  path: string,
  adminKey: string,
  options: { method?: "GET" | "POST" } = {},
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
  });

  const data = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(data.error ?? data.message ?? "Admin request failed.");
  }

  return data;
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
    verifiedHumanAt: number | null;
    suspendedAt: number | null;
  } | null;
  reportCount: number;
  uniqueReporterCount: number;
  riskLevel: "low" | "watch" | "high";
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

export function fetchAdminReports(adminKey: string) {
  return adminRequest<{ reports: AdminReport[] }>("/api/admin/reports", adminKey);
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
