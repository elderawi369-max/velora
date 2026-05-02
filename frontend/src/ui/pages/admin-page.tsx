import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminReports, suspendProfile, unsuspendProfile } from "../../lib/admin-api";

const adminStorageKey = "velora-admin-key";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [activeAdminKey, setActiveAdminKey] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(adminStorageKey) ?? "";
    setAdminKeyInput(saved);
    setActiveAdminKey(saved);
  }, []);

  const reportsQuery = useQuery({
    queryKey: ["adminReports", activeAdminKey],
    queryFn: () => fetchAdminReports(activeAdminKey),
    enabled: Boolean(activeAdminKey),
  });

  const moderationMutation = useMutation({
    mutationFn: async ({
      action,
      profileId,
    }: {
      action: "suspend" | "unsuspend";
      profileId: string;
    }) => {
      if (action === "suspend") {
        return suspendProfile(activeAdminKey, profileId);
      }

      return unsuspendProfile(activeAdminKey, profileId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["adminReports", activeAdminKey],
      });
    },
  });

  const reports = useMemo(() => reportsQuery.data?.reports ?? [], [reportsQuery.data]);

  function saveAdminKey() {
    window.localStorage.setItem(adminStorageKey, adminKeyInput);
    setActiveAdminKey(adminKeyInput);
  }

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Admin</p>
        <h1>Review reports and suspend problem profiles.</h1>
        <p className="intro">
          This is the first moderation console for Velora. It is intentionally
          simple, but it gives us real visibility into abuse before scale makes
          that painful.
        </p>
      </section>

      <section className="panel form-panel">
        <label className="field">
          <span>Admin key</span>
          <input
            type="password"
            value={adminKeyInput}
            onChange={(event) => setAdminKeyInput(event.target.value)}
            placeholder="velora-local-admin"
          />
        </label>
        <button className="primary-button" type="button" onClick={saveAdminKey}>
          Load moderation console
        </button>
      </section>

      {!activeAdminKey ? (
        <section className="panel empty-state">
          <h2>No admin key loaded.</h2>
          <p>Enter the configured admin key to review reports.</p>
        </section>
      ) : null}

      {reportsQuery.isLoading ? (
        <p className="status-message">Loading reports...</p>
      ) : null}

      {reportsQuery.error ? (
        <section className="panel">
          <p className="error-message">
            {reportsQuery.error instanceof Error
              ? reportsQuery.error.message
              : "Unable to load moderation data."}
          </p>
        </section>
      ) : null}

      {activeAdminKey && !reportsQuery.isLoading && !reportsQuery.error && reports.length === 0 ? (
        <section className="panel empty-state">
          <h2>No reports yet.</h2>
          <p>That is good news for now. This page will light up once users start reporting.</p>
        </section>
      ) : null}

      <section className="card-grid">
        {reports.map((report) => {
          const target = report.targetProfile;
          const suspended = Boolean(target?.suspendedAt);

          return (
            <article className="card profile-card" key={report.id}>
              <div className="meta-group">
                <span className="meta-title">Reason</span>
                <p>{report.reason}</p>
              </div>

              <div className="meta-group">
                <span className="meta-title">Target profile</span>
                <p>
                  {target ? `${target.displayName} (@${target.username})` : "Missing profile"}
                </p>
              </div>

              <div className="meta-group">
                <span className="meta-title">Details</span>
                <p>{report.details || "No extra details provided."}</p>
              </div>

              <div className="meta-group">
                <span className="meta-title">Conversation</span>
                <p>{report.conversationId ?? "Not attached to a conversation"}</p>
              </div>

              {target ? (
                <div className="action-row">
                  <button
                    className={suspended ? "secondary-button" : "danger-button"}
                    type="button"
                    disabled={moderationMutation.isPending}
                    onClick={() =>
                      moderationMutation.mutate({
                        action: suspended ? "unsuspend" : "suspend",
                        profileId: target.id,
                      })
                    }
                  >
                    {moderationMutation.isPending
                      ? "Saving..."
                      : suspended
                        ? "Unsuspend"
                        : "Suspend"}
                  </button>
                  <span className={suspended ? "chip chip-muted" : "chip"}>
                    {suspended ? "Suspended" : "Active"}
                  </span>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}

