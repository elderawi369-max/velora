import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminReports,
  fetchSupportTickets,
  suspendProfile,
  unverifyProfile,
  unsuspendProfile,
  verifyProfile,
} from "../../lib/admin-api";

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
  const ticketsQuery = useQuery({
    queryKey: ["adminSupportTickets", activeAdminKey],
    queryFn: () => fetchSupportTickets(activeAdminKey),
    enabled: Boolean(activeAdminKey),
  });

  const moderationMutation = useMutation({
    mutationFn: async ({
      action,
      profileId,
    }: {
      action: "suspend" | "unsuspend" | "verify" | "unverify";
      profileId: string;
    }) => {
      if (action === "verify") {
        return verifyProfile(activeAdminKey, profileId);
      }

      if (action === "unverify") {
        return unverifyProfile(activeAdminKey, profileId);
      }

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
  const tickets = useMemo(() => ticketsQuery.data?.tickets ?? [], [ticketsQuery.data]);

  function saveAdminKey() {
    window.localStorage.setItem(adminStorageKey, adminKeyInput);
    setActiveAdminKey(adminKeyInput);
  }

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Admin</p>
        <h1>Review reports and suspend problem profiles.</h1>
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

      {ticketsQuery.error ? (
        <section className="panel">
          <p className="error-message">
            {ticketsQuery.error instanceof Error
              ? ticketsQuery.error.message
              : "Unable to load support tickets."}
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
          const verifiedHuman = Boolean(target?.verifiedHumanAt);

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

              <div className="chip-row">
                <span className={report.riskLevel === "high" ? "chip" : "chip chip-muted"}>
                  {report.riskLevel === "high"
                    ? "High attention"
                    : report.riskLevel === "watch"
                      ? "Needs review"
                      : "Low volume"}
                </span>
                {verifiedHuman ? <span className="chip">Verified human</span> : null}
                <span className="chip chip-muted">{report.reportCount} reports</span>
                <span className="chip chip-muted">
                  {report.uniqueReporterCount} unique reporters
                </span>
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
                    className="secondary-button"
                    type="button"
                    disabled={moderationMutation.isPending}
                    onClick={() =>
                      moderationMutation.mutate({
                        action: verifiedHuman ? "unverify" : "verify",
                        profileId: target.id,
                      })
                    }
                  >
                    {moderationMutation.isPending
                      ? "Saving..."
                      : verifiedHuman
                        ? "Remove verification"
                        : "Verify human"}
                  </button>
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

      <section className="content-section">
        <section className="section-copy">
          <p className="eyebrow">Support queue</p>
          <h2>User support tickets land here too.</h2>
        </section>

        {ticketsQuery.isLoading ? (
          <p className="status-message">Loading support tickets...</p>
        ) : null}

        {activeAdminKey && !ticketsQuery.isLoading && tickets.length === 0 ? (
          <section className="panel empty-state">
            <h2>No support tickets yet.</h2>
            <p>The support page is wired, but nobody has asked for help yet.</p>
          </section>
        ) : null}

        <section className="card-grid">
          {tickets.map((ticket) => (
            <article className="card profile-card" key={ticket.id}>
              <div className="chip-row">
                <span className="chip">{ticket.status}</span>
                <span className="chip chip-muted">{ticket.email}</span>
              </div>

              <div className="meta-group">
                <span className="meta-title">Subject</span>
                <p>{ticket.subject}</p>
              </div>

              <div className="meta-group">
                <span className="meta-title">Message</span>
                <p>{ticket.message}</p>
              </div>

              <div className="meta-group">
                <span className="meta-title">Profile</span>
                <p>{ticket.profileId ?? "Submitted without a linked profile"}</p>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
