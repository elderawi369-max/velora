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
    suspendedAt: number | null;
  } | null;
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

