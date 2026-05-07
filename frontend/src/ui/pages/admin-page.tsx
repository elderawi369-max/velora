import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminAnalytics,
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
  const analyticsQuery = useQuery({
    queryKey: ["adminAnalytics", activeAdminKey],
    queryFn: () => fetchAdminAnalytics(activeAdminKey),
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
      await queryClient.invalidateQueries({
        queryKey: ["adminAnalytics", activeAdminKey],
      });
    },
  });

  const reports = useMemo(() => reportsQuery.data?.reports ?? [], [reportsQuery.data]);
  const tickets = useMemo(() => ticketsQuery.data?.tickets ?? [], [ticketsQuery.data]);
  const analytics = analyticsQuery.data;

  function saveAdminKey() {
    window.localStorage.setItem(adminStorageKey, adminKeyInput);
    setActiveAdminKey(adminKeyInput);
  }

  function formatUsd(cents: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  }

  function formatEventLabel(eventType: string) {
    return eventType.replaceAll("_", " ");
  }

  function formatRelativeTime(timestamp: number) {
    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  const overviewCards = analytics
    ? [
        { label: "Total users", value: analytics.overview.totalUsers.toString() },
        { label: "Profiles", value: analytics.overview.totalProfiles.toString() },
        {
          label: "Verified humans",
          value: analytics.overview.verifiedProfiles.toString(),
        },
        {
          label: "Fulfilled purchases",
          value: analytics.overview.fulfilledPurchases.toString(),
        },
        {
          label: "Revenue",
          value: formatUsd(analytics.overview.revenueUsdCents),
        },
        {
          label: "Open support",
          value: analytics.overview.openSupportTickets.toString(),
        },
        {
          label: "Reports",
          value: analytics.overview.totalReports.toString(),
        },
        {
          label: "Active boosts",
          value: analytics.overview.activeBoosts.toString(),
        },
      ]
    : [];

  const funnelCards = analytics
    ? [
        { label: "Signups", value: analytics.funnelLast7d.signups.toString() },
        {
          label: "Profiles created",
          value: analytics.funnelLast7d.profilesCreated.toString(),
        },
        {
          label: "Conversations started",
          value: analytics.funnelLast7d.conversationsStarted.toString(),
        },
        {
          label: "Gifts bought",
          value: analytics.funnelLast7d.giftsPurchased.toString(),
        },
        {
          label: "Boosts bought",
          value: analytics.funnelLast7d.boostsPurchased.toString(),
        },
        {
          label: "Reset requests",
          value: analytics.funnelLast7d.passwordResetRequests.toString(),
        },
        {
          label: "7-day revenue",
          value: formatUsd(analytics.funnelLast7d.revenueUsdCents),
        },
      ]
    : [];

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Admin</p>
        <h1>Run the moderation console and founder dashboard from one place.</h1>
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

      {analyticsQuery.error ? (
        <section className="panel">
          <p className="error-message">
            {analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : "Unable to load founder analytics."}
          </p>
        </section>
      ) : null}

      {activeAdminKey ? (
        <section className="content-section">
          <section className="section-copy compact-copy">
            <p className="eyebrow">Founder view</p>
            <h2>See launch health, revenue, and who is driving the product.</h2>
          </section>

          {analyticsQuery.isLoading ? (
            <p className="status-message">Loading founder analytics...</p>
          ) : null}

          {analytics ? (
            <>
              <section className="card-grid">
                {overviewCards.map((card) => (
                  <article className="card profile-card" key={card.label}>
                    <div className="meta-group">
                      <span className="meta-title">{card.label}</span>
                      <h2>{card.value}</h2>
                    </div>
                  </article>
                ))}
              </section>

              <section className="panel">
                <div className="section-copy compact-copy">
                  <p className="eyebrow">Last 7 days</p>
                  <h2>Core funnel and revenue pulse.</h2>
                </div>

                <section className="card-grid">
                  {funnelCards.map((card) => (
                    <article className="card profile-card" key={card.label}>
                      <div className="meta-group">
                        <span className="meta-title">{card.label}</span>
                        <h2>{card.value}</h2>
                      </div>
                    </article>
                  ))}
                </section>
              </section>

              <section className="card-grid">
                <section className="panel">
                  <div className="section-copy compact-copy">
                    <p className="eyebrow">Top profiles</p>
                    <h2>Who is attracting the most repeat interest.</h2>
                  </div>

                  {analytics.topProfiles.length === 0 ? (
                    <div className="empty-state">
                      <p>No profile momentum yet.</p>
                    </div>
                  ) : (
                    <section className="card-grid">
                      {analytics.topProfiles.map((profile) => (
                        <article className="card profile-card" key={profile.id}>
                          <div className="meta-group">
                            <h2>{profile.displayName}</h2>
                            <p>@{profile.username}</p>
                          </div>

                          <div className="chip-row">
                            <span className="chip">{profile.giftsReceived} gifts</span>
                            <span className="chip chip-muted">
                              {profile.favoritesReceived} favorites
                            </span>
                            <span className="chip chip-muted">
                              {profile.activeBoostCount} boosts active
                            </span>
                          </div>

                          <div className="meta-group">
                            <span className="meta-title">Revenue touch</span>
                            <p>{formatUsd(profile.purchaseRevenueCents)}</p>
                          </div>

                          <div className="meta-group">
                            <span className="meta-title">Reports</span>
                            <p>{profile.reportsReceived}</p>
                          </div>
                        </article>
                      ))}
                    </section>
                  )}
                </section>

                <section className="panel">
                  <div className="section-copy compact-copy">
                    <p className="eyebrow">Recent events</p>
                    <h2>Watch live product behavior without opening the database.</h2>
                  </div>

                  {analytics.recentEvents.length === 0 ? (
                    <div className="empty-state">
                      <p>No events yet.</p>
                    </div>
                  ) : (
                    <section className="card-grid">
                      {analytics.recentEvents.map((event) => (
                        <article className="card profile-card" key={event.id}>
                          <div className="chip-row">
                            <span className="chip">{formatEventLabel(event.eventType)}</span>
                            <span className="chip chip-muted">
                              {formatRelativeTime(event.createdAt)}
                            </span>
                          </div>

                          {event.profile ? (
                            <div className="meta-group">
                              <span className="meta-title">Profile</span>
                              <p>
                                {event.profile.displayName} (@{event.profile.username})
                              </p>
                            </div>
                          ) : null}

                          {event.targetProfile ? (
                            <div className="meta-group">
                              <span className="meta-title">Target</span>
                              <p>
                                {event.targetProfile.displayName} (@{event.targetProfile.username})
                              </p>
                            </div>
                          ) : null}

                          {Object.keys(event.data).length > 0 ? (
                            <div className="meta-group">
                              <span className="meta-title">Details</span>
                              <p>{JSON.stringify(event.data)}</p>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </section>
                  )}
                </section>
              </section>
            </>
          ) : null}
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
