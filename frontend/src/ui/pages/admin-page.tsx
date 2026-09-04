import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminProfileByUsername,
  fetchAdminConversation,
  fetchAdminAnalytics,
  fetchAdminAiCompanionReports,
  fetchAdminReports,
  fetchStarterCreditEligibleUsers,
  fetchSupportTickets,
  grantFounderCredits,
  replyToSupportTicket,
  sendStarterCreditEmailBatch,
  sendFounderGift,
  suspendProfile,
  unverifyProfile,
  unsuspendProfile,
  updateProfileContent,
  verifyProfile,
  type AdminConversation,
  type AdminProfile,
  type AdminReport,
  type DailyTrendPoint,
  type EngagementPeriod,
  type GooglePlayBillingPurchase,
  type GooglePlayBillingSummary,
  type SignupFunnelPeriod,
  type StarterCreditEligibleUser,
} from "../../lib/admin-api";

const adminStorageKey = "velora-admin-key";

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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(timestamp: number | null) {
  if (!timestamp) {
    return "—";
  }

  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const starterCreditCampaignDefaultSubject = "Your Velora starter credits are waiting";

const starterCreditCampaignDefaultMessage = `Hi,

Your Velora profile now looks ready to unlock 2 complimentary Challenge Credits.

You can use them for fun inside Velora:
- Vibe Check to compare chemistry
- Trivia Challenge to break the ice
- Live trivia when someone else is active

If everything on your account still checks out, Velora will add the credits automatically when you open the app.

To avoid missing replies, challenge invites, and reward moments, please turn notifications on for Velora in your phone settings.

Open Velora here:
https://app.velorachat.com

See you inside,
Velora`;

function getPromptDraft(
  promptEntries: Array<{ question: string; answer: string }>,
  index: number,
) {
  return promptEntries[index] ?? { question: "", answer: "" };
}

function getFunnelSteps(funnel: SignupFunnelPeriod) {
  const counts = [
    { label: "Signups", value: funnel.signups },
    { label: "Profiles created", value: funnel.profilesCreated },
    { label: "Started a conversation", value: funnel.usersStartedConversation },
    { label: "Sent a message", value: funnel.usersSentMessage },
    { label: "Received a reply", value: funnel.usersReceivedReply },
  ];

  return counts.map((step, index) => {
    const previous = index === 0 ? step.value : counts[index - 1].value;
    const fromPrevious = previous > 0 ? (step.value / previous) * 100 : 0;
    const fromSignup = counts[0].value > 0 ? (step.value / counts[0].value) * 100 : 0;

    return {
      ...step,
      fromPrevious,
      fromSignup,
    };
  });
}

function getTrendSeries(points: DailyTrendPoint[], key: keyof Omit<DailyTrendPoint, "day">) {
  const max = Math.max(1, ...points.map((point) => point[key]));

  return points.map((point) => ({
    day: point.day,
    value: point[key],
    heightPercent: (point[key] / max) * 100,
  }));
}

function MetricGrid({
  title,
  eyebrow,
  items,
}: {
  title: string;
  eyebrow: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="panel">
      <div className="section-copy compact-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <section className="card-grid">
        {items.map((item) => (
          <article className="card profile-card" key={item.label}>
            <div className="meta-group">
              <span className="meta-title">{item.label}</span>
              <h2>{item.value}</h2>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function getBillingStatusLabel(purchase: GooglePlayBillingPurchase) {
  if (purchase.isLegacyUntracked) {
    return "Legacy untracked";
  }

  if (purchase.mobileConsumeStatus === "consumed") {
    return "Consumed";
  }

  if (purchase.mobileConsumeStatus === "failed") {
    return "Failed";
  }

  if (purchase.status === "fulfilled") {
    return "Pending consume";
  }

  return purchase.status;
}

function BillingPanel({
  summary,
  recentPurchases,
}: {
  summary: GooglePlayBillingSummary;
  recentPurchases: GooglePlayBillingPurchase[];
}) {
  const metrics = [
    { label: "Verified", value: summary.verifiedPurchases.toString() },
    { label: "Fulfilled", value: summary.fulfilledPurchases.toString() },
    { label: "Consumed", value: summary.consumedPurchases.toString() },
    { label: "Pending consumption", value: summary.pendingConsumption.toString() },
    { label: "Failed consumption", value: summary.failedConsumption.toString() },
    { label: "Refund-risk", value: summary.atRiskPurchases.toString() },
    { label: "Legacy untracked", value: summary.legacyUntrackedPurchases.toString() },
    { label: "Google revenue", value: formatUsd(summary.revenueUsdCents) },
  ];

  return (
    <section className="panel">
      <div className="section-copy compact-copy">
        <p className="eyebrow">Billing health</p>
        <h2>Google Play one-time purchases at a glance.</h2>
        <p>
          Refunds are not directly tracked yet, so refund-risk shows fulfilled purchases that still
          are not consumed after 30 minutes. Legacy purchases from before tracking are labeled
          separately.
        </p>
      </div>

      <section className="card-grid">
        {metrics.map((metric) => (
          <article className="card profile-card" key={metric.label}>
            <div className="meta-group">
              <span className="meta-title">{metric.label}</span>
              <h2>{metric.value}</h2>
            </div>
          </article>
        ))}
      </section>

      <div className="meta-group">
        <span className="meta-title">Recent Google Play purchases</span>
        {recentPurchases.length === 0 ? (
          <p className="status-message">No Google Play purchases yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Buyer</th>
                  <th>Target</th>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{formatDateTime(purchase.createdAt)}</td>
                    <td>
                      {purchase.buyerDisplayName} (@{purchase.buyerUsername})
                    </td>
                    <td>
                      {purchase.targetDisplayName && purchase.targetUsername
                        ? `${purchase.targetDisplayName} (@${purchase.targetUsername})`
                        : "—"}
                    </td>
                    <td>
                      {purchase.itemKey} ({purchase.productKind})
                    </td>
                    <td>{formatUsd(purchase.amountCents)}</td>
                    <td>{getBillingStatusLabel(purchase)}</td>
                    <td>{purchase.mobileConsumeAttemptCount}</td>
                    <td>{purchase.mobileConsumeLastError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function EngagementPanel({
  title,
  eyebrow,
  period,
}: {
  title: string;
  eyebrow: string;
  period: EngagementPeriod;
}) {
  const metrics = [
    { label: "Active users", value: period.activeUsers.toString() },
    { label: "Messages sent", value: period.messagesSent.toString() },
    { label: "Unique message senders", value: period.uniqueMessageSenders.toString() },
    { label: "Active conversations", value: period.activeConversations.toString() },
    { label: "New conversations", value: period.newConversations.toString() },
    { label: "Avg messages / active convo", value: period.averageMessagesPerActiveConversation.toFixed(2) },
    { label: "Median messages / active convo", value: period.medianMessagesPerActiveConversation.toFixed(2) },
    { label: "2+ messages", value: period.conversationsWith2PlusMessages.toString() },
    { label: "5+ messages", value: period.conversationsWith5PlusMessages.toString() },
    { label: "10+ messages", value: period.conversationsWith10PlusMessages.toString() },
    { label: "One-sided convos", value: period.oneSidedConversations.toString() },
    { label: "Two-way convos", value: period.twoWayConversations.toString() },
    { label: "Reply rate", value: formatPercent(period.replyRate) },
  ];

  return (
    <section className="panel">
      <div className="section-copy compact-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <section className="card-grid">
        {metrics.map((metric) => (
          <article className="card profile-card" key={metric.label}>
            <div className="meta-group">
              <span className="meta-title">{metric.label}</span>
              <h2>{metric.value}</h2>
            </div>
          </article>
        ))}
      </section>
      <div className="meta-group">
        <span className="meta-title">Top conversations by message count</span>
        {period.topConversations.length === 0 ? (
          <p className="status-message">No active conversations in this period yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Conversation</th>
                  <th>Messages</th>
                  <th>Created</th>
                  <th>Last message</th>
                </tr>
              </thead>
              <tbody>
                {period.topConversations.map((conversation) => (
                  <tr key={conversation.conversationId}>
                    <td>
                      {conversation.profileADisplayName} (@{conversation.profileAUsername}) {"↔"}{" "}
                      {conversation.profileBDisplayName} (@{conversation.profileBUsername})
                    </td>
                    <td>{conversation.messageCount}</td>
                    <td>{formatDate(conversation.createdAt)}</td>
                    <td>{formatDate(conversation.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function FunnelPanel({
  title,
  eyebrow,
  funnel,
}: {
  title: string;
  eyebrow: string;
  funnel: SignupFunnelPeriod;
}) {
  const steps = getFunnelSteps(funnel);

  return (
    <section className="panel">
      <div className="section-copy compact-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Users</th>
              <th>From previous</th>
              <th>From signups</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => (
              <tr key={step.label}>
                <td>{step.label}</td>
                <td>{step.value}</td>
                <td>{index === 0 ? "—" : formatPercent(step.fromPrevious)}</td>
                <td>{formatPercent(step.fromSignup)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrendPanel({
  title,
  eyebrow,
  points,
  metricKey,
}: {
  title: string;
  eyebrow: string;
  points: DailyTrendPoint[];
  metricKey: keyof Omit<DailyTrendPoint, "day">;
}) {
  const series = getTrendSeries(points, metricKey);

  return (
    <section className="panel">
      <div className="section-copy compact-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="trend-chart">
        {series.map((point) => (
          <div className="trend-bar-group" key={`${metricKey}-${point.day}`}>
            <div
              className="trend-bar"
              style={{ height: `${Math.max(point.heightPercent, point.value > 0 ? 8 : 0)}%` }}
              title={`${point.day}: ${point.value}`}
            />
            <span className="trend-label">{point.day.slice(5)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [activeAdminKey, setActiveAdminKey] = useState("");
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);
  const [lookupUsername, setLookupUsername] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<AdminProfile | null>(null);
  const [creditGrantDrafts, setCreditGrantDrafts] = useState<Record<string, string>>({});
  const [giftDrafts, setGiftDrafts] = useState<Record<string, "rose" | "starlight" | "crown">>({});
  const [selectedStarterCreditProfileIds, setSelectedStarterCreditProfileIds] = useState<
    Record<string, boolean>
  >({});
  const [starterCreditEmailSubject, setStarterCreditEmailSubject] = useState(
    starterCreditCampaignDefaultSubject,
  );
  const [starterCreditEmailMessage, setStarterCreditEmailMessage] = useState(
    starterCreditCampaignDefaultMessage,
  );
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<
    Record<string, { subject: string; message: string }>
  >({});
  const [contentDrafts, setContentDrafts] = useState<
    Record<
      string,
      {
        bio: string;
        promptEntries: Array<{ question: string; answer: string }>;
      }
    >
  >({});

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
  const aiCompanionReportsQuery = useQuery({
    queryKey: ["adminAiCompanionReports", activeAdminKey],
    queryFn: () => fetchAdminAiCompanionReports(activeAdminKey),
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
  const starterCreditEligibleUsersQuery = useQuery({
    queryKey: ["adminStarterCreditEligibleUsers", activeAdminKey],
    queryFn: () => fetchStarterCreditEligibleUsers(activeAdminKey),
    enabled: Boolean(activeAdminKey),
  });
  const conversationQuery = useQuery({
    queryKey: ["adminConversation", activeAdminKey, openConversationId],
    queryFn: () => fetchAdminConversation(activeAdminKey, openConversationId ?? ""),
    enabled: Boolean(activeAdminKey && openConversationId),
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

  const contentMutation = useMutation({
    mutationFn: async ({
      profileId,
      bio,
      promptEntries,
    }: {
      profileId: string;
      bio: string;
      promptEntries: Array<{ question: string; answer: string }>;
    }) =>
      updateProfileContent(activeAdminKey, profileId, {
        bio,
        promptEntries,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["adminReports", activeAdminKey],
      });
      if (contentMutation.variables?.profileId === selectedProfile?.id) {
        const updatedProfile = contentMutation.data?.profile;
        if (updatedProfile) {
          setSelectedProfile(updatedProfile);
        }
      }
    },
  });

  const founderRewardMutation = useMutation({
    mutationFn: async (
      input:
        | { kind: "credits"; profileId: string; credits: number }
        | { kind: "gift"; profileId: string; giftType: "rose" | "starlight" | "crown" },
    ) => {
      if (input.kind === "credits") {
        return grantFounderCredits(activeAdminKey, input.profileId, input.credits);
      }

      return sendFounderGift(activeAdminKey, input.profileId, input.giftType);
    },
    onSuccess: async (result) => {
      if (selectedProfile && result.profile.id === selectedProfile.id) {
        setSelectedProfile(result.profile);
      }
      await queryClient.invalidateQueries({
        queryKey: ["adminReports", activeAdminKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["adminAnalytics", activeAdminKey],
      });
    },
  });

  const supportReplyMutation = useMutation({
    mutationFn: async (input: { ticketId: string; subject: string; message: string }) =>
      replyToSupportTicket(activeAdminKey, input.ticketId, {
        subject: input.subject,
        message: input.message,
      }),
    onSuccess: async (_result, variables) => {
      setSupportReplyDrafts((current) => ({
        ...current,
        [variables.ticketId]: {
          subject: variables.subject,
          message: "",
        },
      }));
      await queryClient.invalidateQueries({
        queryKey: ["adminSupportTickets", activeAdminKey],
      });
    },
  });

  const starterCreditEmailMutation = useMutation({
    mutationFn: async (input: { profileIds: string[]; subject: string; message: string }) =>
      sendStarterCreditEmailBatch(activeAdminKey, input),
    onSuccess: async (_result, variables) => {
      setSelectedStarterCreditProfileIds((current) => {
        const next = { ...current };
        for (const profileId of variables.profileIds) {
          delete next[profileId];
        }
        return next;
      });
      await queryClient.invalidateQueries({
        queryKey: ["adminStarterCreditEligibleUsers", activeAdminKey],
      });
    },
  });

  const profileLookupMutation = useMutation({
    mutationFn: async (username: string) =>
      fetchAdminProfileByUsername(activeAdminKey, username),
    onSuccess: ({ profile }) => {
      setSelectedProfile(profile);
      setContentDrafts((current) => ({
        ...current,
        [profile.id]: {
          bio: profile.bio,
          promptEntries: profile.promptEntries,
        },
      }));
    },
  });

  const reports = useMemo(() => reportsQuery.data?.reports ?? [], [reportsQuery.data]);
  const aiCompanionReports = useMemo(() => aiCompanionReportsQuery.data?.reports ?? [], [aiCompanionReportsQuery.data]);
  const tickets = useMemo(() => ticketsQuery.data?.tickets ?? [], [ticketsQuery.data]);
  const starterCreditEligibleUsers = useMemo(
    () => starterCreditEligibleUsersQuery.data?.users ?? [],
    [starterCreditEligibleUsersQuery.data],
  );
  const analytics = analyticsQuery.data;
  const selectedStarterCreditRecipients = useMemo(
    () =>
      starterCreditEligibleUsers.filter((user) => selectedStarterCreditProfileIds[user.profileId]),
    [selectedStarterCreditProfileIds, starterCreditEligibleUsers],
  );

  useEffect(() => {
    if (!reports.length) {
      return;
    }

    setContentDrafts((current) => {
      const next = { ...current };

      for (const report of reports) {
        const target = report.targetProfile;
        if (!target || next[target.id]) {
          continue;
        }

        next[target.id] = {
          bio: target.bio,
          promptEntries: target.promptEntries,
        };
      }

      return next;
    });
  }, [reports]);

  function saveAdminKey() {
    window.localStorage.setItem(adminStorageKey, adminKeyInput);
    setActiveAdminKey(adminKeyInput);
  }

  function toggleConversation(conversationId: string | null) {
    setOpenConversationId((current) =>
      current === conversationId || !conversationId ? null : conversationId,
    );
  }

  function toggleStarterCreditRecipient(profileId: string) {
    setSelectedStarterCreditProfileIds((current) => ({
      ...current,
      [profileId]: !current[profileId],
    }));
  }

  function selectAllStarterCreditRecipients() {
    setSelectedStarterCreditProfileIds(
      Object.fromEntries(starterCreditEligibleUsers.map((user) => [user.profileId, true])),
    );
  }

  function clearStarterCreditRecipients() {
    setSelectedStarterCreditProfileIds({});
  }

  function renderProfileCleanupCard(profile: AdminProfile, summary?: React.ReactNode) {
    const suspended = Boolean(profile.suspendedAt);
    const verifiedHuman = Boolean(profile.verifiedHumanAt);
    const draft =
      contentDrafts[profile.id] ?? {
        bio: profile.bio,
        promptEntries: profile.promptEntries,
      };

    return (
        <article className="card profile-card" key={profile.id}>
          <div className="meta-group">
            <span className="meta-title">Target profile</span>
            <p>
              {profile.displayName} (@{profile.username})
            </p>
          </div>

          {profile.email ? (
            <div className="meta-group">
              <span className="meta-title">Account email</span>
              <p>{profile.email}</p>
            </div>
          ) : null}

          {profile.createdAt ? (
            <div className="meta-group">
              <span className="meta-title">Created</span>
              <p>{formatDate(profile.createdAt)}</p>
            </div>
          ) : null}

          {summary ?? null}

        <div className="chip-row">
          {verifiedHuman ? <span className="chip">Verified human</span> : null}
          <span className="chip chip-muted">{profile.challengeCredits} challenge credits</span>
          <span className={suspended ? "chip chip-muted" : "chip"}>
            {suspended ? "Suspended" : "Active"}
          </span>
        </div>

        <div className="meta-group">
          <span className="meta-title">Founder rewards</span>
          <p>Grant free challenge credits or send a free gift for marketing, support, or recovery.</p>
        </div>

        <div className="panel form-panel">
          <label className="field">
            <span>Free challenge credits</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={creditGrantDrafts[profile.id] ?? "3"}
              onChange={(event) =>
                setCreditGrantDrafts((current) => ({
                  ...current,
                  [profile.id]: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={founderRewardMutation.isPending}
            onClick={() => {
              const credits = Number(creditGrantDrafts[profile.id] ?? "3");
              if (!Number.isFinite(credits) || credits < 1) {
                return;
              }

              founderRewardMutation.mutate({
                kind: "credits",
                profileId: profile.id,
                credits: Math.floor(credits),
              });
            }}
          >
            {founderRewardMutation.isPending ? "Sending..." : "Grant free credits"}
          </button>
        </div>

        <div className="panel form-panel">
          <label className="field">
            <span>Free gift</span>
            <select
              value={giftDrafts[profile.id] ?? "rose"}
              onChange={(event) =>
                setGiftDrafts((current) => ({
                  ...current,
                  [profile.id]: event.target.value as "rose" | "starlight" | "crown",
                }))
              }
            >
              <option value="rose">Rose Aura</option>
              <option value="starlight">Starlight Ring</option>
              <option value="crown">Velora Crown</option>
            </select>
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={founderRewardMutation.isPending}
            onClick={() =>
              founderRewardMutation.mutate({
                kind: "gift",
                profileId: profile.id,
                giftType: giftDrafts[profile.id] ?? "rose",
              })
            }
          >
            {founderRewardMutation.isPending ? "Sending..." : "Send free gift"}
          </button>
        </div>

        <div className="meta-group">
          <span className="meta-title">Profile cleanup</span>
          <p>Remove email or off-app contact details from bio or prompts, then save the cleaned text.</p>
        </div>

        <label className="field">
          <span>Bio</span>
          <textarea
            rows={4}
            value={draft.bio}
            onChange={(event) => setBioDraft(profile.id, event.target.value)}
          />
        </label>

        {[0, 1, 2].map((index) => {
          const prompt = getPromptDraft(draft.promptEntries, index);

          return (
            <div className="panel form-panel" key={`${profile.id}-prompt-${index}`}>
              <label className="field">
                <span>Prompt {index + 1} question</span>
                <input
                  type="text"
                  value={prompt.question}
                  onChange={(event) =>
                    setPromptDraft(profile.id, index, "question", event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Prompt {index + 1} answer</span>
                <textarea
                  rows={3}
                  value={prompt.answer}
                  onChange={(event) =>
                    setPromptDraft(profile.id, index, "answer", event.target.value)
                  }
                />
              </label>
            </div>
          );
        })}

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            disabled={contentMutation.isPending}
            onClick={() =>
              contentMutation.mutate({
                profileId: profile.id,
                bio: draft.bio,
                promptEntries: draft.promptEntries,
              })
            }
          >
            {contentMutation.isPending ? "Saving..." : "Save profile text"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={contentMutation.isPending}
            onClick={() => setBioDraft(profile.id, "")}
          >
            Clear bio
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={contentMutation.isPending}
            onClick={() =>
              setContentDrafts((current) => ({
                ...current,
                [profile.id]: {
                  bio: current[profile.id]?.bio ?? "",
                  promptEntries: [],
                },
              }))
            }
          >
            Clear prompts
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={contentMutation.isPending}
            onClick={() =>
              contentMutation.mutate({
                profileId: profile.id,
                bio: "",
                promptEntries: [],
              })
            }
          >
            {contentMutation.isPending ? "Saving..." : "Clear all text"}
          </button>
        </div>

        <div className="action-row">
          <button
            className="secondary-button"
            type="button"
            disabled={moderationMutation.isPending}
            onClick={() =>
              moderationMutation.mutate({
                action: verifiedHuman ? "unverify" : "verify",
                profileId: profile.id,
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
                profileId: profile.id,
              })
            }
          >
            {moderationMutation.isPending ? "Saving..." : suspended ? "Unsuspend" : "Suspend"}
          </button>
        </div>

        {contentMutation.error && contentMutation.variables?.profileId === profile.id ? (
          <p className="error-message">
            {contentMutation.error instanceof Error
              ? contentMutation.error.message
              : "Unable to update profile content."}
          </p>
        ) : null}

        {contentMutation.isSuccess && contentMutation.variables?.profileId === profile.id ? (
          <p className="status-message">Profile text updated.</p>
        ) : null}

        {founderRewardMutation.error ? (
          <p className="error-message">
            {founderRewardMutation.error instanceof Error
              ? founderRewardMutation.error.message
              : "Unable to send founder reward."}
          </p>
        ) : null}

        {founderRewardMutation.isSuccess ? (
          <p className="status-message">Founder reward sent.</p>
        ) : null}
      </article>
    );
  }

  function getContentDraft(report: AdminReport) {
    const target = report.targetProfile;
    if (!target) {
      return {
        bio: "",
        promptEntries: [] as Array<{ question: string; answer: string }>,
      };
    }

    return (
      contentDrafts[target.id] ?? {
        bio: target.bio,
        promptEntries: target.promptEntries,
      }
    );
  }

  function setBioDraft(profileId: string, bio: string) {
    setContentDrafts((current) => ({
      ...current,
      [profileId]: {
        bio,
        promptEntries: current[profileId]?.promptEntries ?? [],
      },
    }));
  }

  function setPromptDraft(
    profileId: string,
    index: number,
    field: "question" | "answer",
    value: string,
  ) {
    setContentDrafts((current) => {
      const existing = current[profileId] ?? {
        bio: "",
        promptEntries: [],
      };
      const promptEntries = [...existing.promptEntries];
      const prompt = getPromptDraft(promptEntries, index);

      promptEntries[index] = {
        ...prompt,
        [field]: value,
      };

      return {
        ...current,
        [profileId]: {
          ...existing,
          promptEntries,
        },
      };
    });
  }

  const overviewCards = analytics
    ? [
        { label: "Total users", value: analytics.overview.totalUsers.toString() },
        { label: "Profiles", value: analytics.overview.totalProfiles.toString() },
        { label: "Verified humans", value: analytics.overview.verifiedProfiles.toString() },
        { label: "Fulfilled purchases", value: analytics.overview.fulfilledPurchases.toString() },
        { label: "Revenue", value: formatUsd(analytics.overview.revenueUsdCents) },
        { label: "Open support", value: analytics.overview.openSupportTickets.toString() },
        { label: "Reports", value: analytics.overview.totalReports.toString() },
        { label: "Active boosts", value: analytics.overview.activeBoosts.toString() },
      ]
    : [];

  const funnelCards = analytics
    ? [
        { label: "Signups", value: analytics.funnelLast7d.signups.toString() },
        { label: "Profiles created", value: analytics.funnelLast7d.profilesCreated.toString() },
        { label: "Conversations started", value: analytics.funnelLast7d.conversationsStarted.toString() },
        { label: "Gifts bought", value: analytics.funnelLast7d.giftsPurchased.toString() },
        { label: "Boosts bought", value: analytics.funnelLast7d.boostsPurchased.toString() },
        { label: "Reset requests", value: analytics.funnelLast7d.passwordResetRequests.toString() },
        { label: "7-day revenue", value: formatUsd(analytics.funnelLast7d.revenueUsdCents) },
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

      {reportsQuery.isLoading ? <p className="status-message">Loading reports...</p> : null}

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
            <h2>See launch health, revenue, engagement, retention, and conversation quality.</h2>
          </section>

          <section className="panel form-panel">
            <div className="section-copy compact-copy">
              <p className="eyebrow">Profile lookup</p>
              <h2>Find any profile by username and clean it directly.</h2>
            </div>
            <label className="field">
              <span>Username</span>
              <input
                value={lookupUsername}
                onChange={(event) => setLookupUsername(event.target.value)}
                placeholder="mercillar"
              />
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={!lookupUsername.trim() || profileLookupMutation.isPending}
              onClick={() => profileLookupMutation.mutate(lookupUsername)}
            >
              {profileLookupMutation.isPending ? "Finding..." : "Find profile"}
            </button>
            {profileLookupMutation.error ? (
              <p className="error-message">
                {profileLookupMutation.error instanceof Error
                  ? profileLookupMutation.error.message
                  : "Unable to find profile."}
              </p>
            ) : null}
          </section>

          {selectedProfile
            ? renderProfileCleanupCard(
                selectedProfile,
                <div className="meta-group">
                  <span className="meta-title">Lookup result</span>
                  <p>Direct moderation access for profiles that are not currently in the reports queue.</p>
                </div>,
              )
            : null}

          {analyticsQuery.isLoading ? <p className="status-message">Loading founder analytics...</p> : null}

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

              <MetricGrid
                eyebrow="Legacy 7-day pulse"
                title="Existing funnel and revenue pulse."
                items={funnelCards}
              />

              <BillingPanel
                summary={analytics.googlePlayBilling.summary}
                recentPurchases={analytics.googlePlayBilling.recentPurchases}
              />

              <MetricGrid
                eyebrow="AI companion photos"
                title={`Generation safeguards · ${analytics.aiCompanionPhotoGeneration.billingPeriod}`}
                items={[
                  { label: "Generation attempts", value: analytics.aiCompanionPhotoGeneration.attempts.toString() },
                  { label: "Estimated spend", value: formatUsd(analytics.aiCompanionPhotoGeneration.estimatedSpendCents) },
                  { label: "Monthly ceiling", value: formatUsd(analytics.aiCompanionPhotoGeneration.spendCeilingCents) },
                  { label: "Budget remaining", value: formatUsd(analytics.aiCompanionPhotoGeneration.remainingCents) },
                  { label: "Free cap", value: `${analytics.aiCompanionPhotoGeneration.freeLifetimeLimit} lifetime` },
                  { label: "Pro daily cap", value: `${analytics.aiCompanionPhotoGeneration.proDailyLimit} photos` },
                  { label: "Ultra daily cap", value: `${analytics.aiCompanionPhotoGeneration.ultraDailyLimit} photos` },
                  { label: "Generation status", value: analytics.aiCompanionPhotoGeneration.paused ? "Paused at ceiling" : "Available" },
                ]}
              />

              <section className="card-grid">
                <EngagementPanel
                  eyebrow="Engagement"
                  title="Last 7 days"
                  period={analytics.engagement.last7d}
                />
                <EngagementPanel
                  eyebrow="Engagement"
                  title="Last 30 days"
                  period={analytics.engagement.last30d}
                />
              </section>

              <section className="card-grid">
                <FunnelPanel
                  eyebrow="Signup funnel"
                  title="Last 7 days"
                  funnel={analytics.signupFunnels.last7d}
                />
                <FunnelPanel
                  eyebrow="Signup funnel"
                  title="Last 30 days"
                  funnel={analytics.signupFunnels.last30d}
                />
              </section>

              <section className="panel">
                <div className="section-copy compact-copy">
                  <p className="eyebrow">Retention</p>
                  <h2>Meaningful activity after signup.</h2>
                </div>
                <section className="card-grid">
                  {analytics.retention.map((item) => (
                    <article className="card profile-card" key={item.day}>
                      <div className="meta-group">
                        <span className="meta-title">Day {item.day}</span>
                        <h2>{formatPercent(item.retentionRate)}</h2>
                        <p>
                          {item.retainedUsers} retained / {item.eligibleUsers} eligible
                        </p>
                      </div>
                    </article>
                  ))}
                </section>
              </section>

              <section className="panel">
                <div className="section-copy compact-copy">
                  <p className="eyebrow">Daily trends</p>
                  <h2>30-day momentum by acquisition, activation, and conversation quality.</h2>
                </div>
                <section className="card-grid">
                  <TrendPanel eyebrow="Trend" title="Signups" points={analytics.dailyTrends} metricKey="signups" />
                  <TrendPanel eyebrow="Trend" title="Profiles created" points={analytics.dailyTrends} metricKey="profilesCreated" />
                  <TrendPanel eyebrow="Trend" title="Active users" points={analytics.dailyTrends} metricKey="activeUsers" />
                  <TrendPanel eyebrow="Trend" title="Messages sent" points={analytics.dailyTrends} metricKey="messagesSent" />
                  <TrendPanel eyebrow="Trend" title="Conversations started" points={analytics.dailyTrends} metricKey="conversationsStarted" />
                  <TrendPanel eyebrow="Trend" title="Two-way conversations" points={analytics.dailyTrends} metricKey="twoWayConversations" />
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
                            <span className="chip chip-muted">{profile.favoritesReceived} favorites</span>
                            <span className="chip chip-muted">{profile.activeBoostCount} boosts active</span>
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
                            <span className="chip chip-muted">{formatRelativeTime(event.createdAt)}</span>
                          </div>

                          {event.profile ? (
                            <div className="meta-group">
                              <span className="meta-title">Profile</span>
                              <p>{event.profile.displayName} (@{event.profile.username})</p>
                            </div>
                          ) : null}

                          {event.targetProfile ? (
                            <div className="meta-group">
                              <span className="meta-title">Target</span>
                              <p>{event.targetProfile.displayName} (@{event.targetProfile.username})</p>
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
          <h2>No profile reports yet.</h2>
          <p>This section will light up when users report another member or conversation.</p>
        </section>
      ) : null}

      {activeAdminKey ? <section className="content-section">
        <section className="section-copy compact-copy">
          <p className="eyebrow">AI companion safety</p>
          <h2>Reported companion responses and photos.</h2>
          <p>Review the exact response text or the prompt behind a reported generated photo.</p>
        </section>
        {aiCompanionReportsQuery.isLoading ? <p className="status-message">Loading AI companion reports...</p> : null}
        {aiCompanionReportsQuery.error ? <p className="error-message">{aiCompanionReportsQuery.error instanceof Error ? aiCompanionReportsQuery.error.message : "Unable to load AI companion reports."}</p> : null}
        {!aiCompanionReportsQuery.isLoading && !aiCompanionReportsQuery.error && aiCompanionReports.length === 0 ? <section className="panel empty-state"><h2>No AI companion reports yet.</h2><p>Reported responses and generated photos will appear here.</p></section> : null}
        <section className="card-grid">
          {aiCompanionReports.map((report) => <article className="card profile-card" key={report.id}>
            <div className="chip-row">
              <span className="chip">{report.contentType === "photo" ? "Generated photo" : "Companion response"}</span>
              <span className="chip chip-muted">{report.reason.replaceAll("_", " ")}</span>
              <span className="chip chip-muted">{formatRelativeTime(report.createdAt)}</span>
            </div>
            <div className="meta-group"><span className="meta-title">Companion</span><p>{report.companionName}</p></div>
            <div className="meta-group"><span className="meta-title">Reported by</span><p>{report.userName ? `${report.userName} · ` : ""}{report.userEmail}</p></div>
            <div className="meta-group"><span className="meta-title">{report.contentType === "photo" ? "Photo prompt" : "Response text"}</span><p>{report.content}</p></div>
            {report.details ? <div className="meta-group"><span className="meta-title">Extra details</span><p>{report.details}</p></div> : null}
            <div className="meta-group"><span className="meta-title">Content ID</span><p>{report.contentId}</p></div>
          </article>)}
        </section>
      </section> : null}

      <section className="card-grid">
        {reports.map((report) => {
          const target = report.targetProfile;
          const suspended = Boolean(target?.suspendedAt);
          const verifiedHuman = Boolean(target?.verifiedHumanAt);
          const isConversationOpen = Boolean(
            report.conversationId && openConversationId === report.conversationId,
          );
          const conversation = isConversationOpen
            ? (conversationQuery.data?.conversation as AdminConversation | undefined)
            : undefined;

          return (
            <article className="card profile-card" key={report.id}>
              <div className="meta-group">
                <span className="meta-title">Reason</span>
                <p>{report.reason}</p>
              </div>

              <div className="meta-group">
                <span className="meta-title">Target profile</span>
                <p>{target ? `${target.displayName} (@${target.username})` : "Missing profile"}</p>
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
                <span className="chip chip-muted">{report.uniqueReporterCount} unique reporters</span>
              </div>

              <div className="meta-group">
                <span className="meta-title">Details</span>
                <p>{report.details || "No extra details provided."}</p>
              </div>

              <div className="meta-group">
                <span className="meta-title">Conversation</span>
                <p>{report.conversationId ?? "Not attached to a conversation"}</p>
              </div>

              {target
                ? renderProfileCleanupCard(
                    target,
                    report.conversationId ? (
                      <>
                        <div className="action-row">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => toggleConversation(report.conversationId)}
                          >
                            {isConversationOpen ? "Hide conversation" : "Review conversation"}
                          </button>
                        </div>
                        {isConversationOpen ? (
                          <section className="panel">
                            <div className="meta-group">
                              <span className="meta-title">Reported conversation</span>
                              {conversationQuery.isLoading ? (
                                <p className="status-message">Loading conversation...</p>
                              ) : null}
                              {conversationQuery.error ? (
                                <p className="error-message">
                                  {conversationQuery.error instanceof Error
                                    ? conversationQuery.error.message
                                    : "Unable to load conversation."}
                                </p>
                              ) : null}
                              {conversation ? (
                                <>
                                  <p>
                                    {conversation.participants
                                      .filter(Boolean)
                                      .map((participant) =>
                                        `${participant?.displayName} (@${participant?.username})`,
                                      )
                                      .join(" and ")}
                                  </p>
                                  <div className="meta-group">
                                    {conversation.messages.length === 0 ? (
                                      <p>No messages in this conversation yet.</p>
                                    ) : (
                                      conversation.messages.map((message) => (
                                        <article className="card profile-card" key={message.id}>
                                          <div className="chip-row">
                                            <span className="chip">
                                              {message.sender?.displayName ?? "Unknown sender"}
                                            </span>
                                            <span className="chip chip-muted">
                                              {formatDate(message.createdAt)}
                                            </span>
                                          </div>
                                          <p>{message.body}</p>
                                        </article>
                                      ))
                                    )}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </section>
                        ) : null}
                      </>
                    ) : undefined,
                  )
                : null}
            </article>
          );
        })}
      </section>

      <section className="content-section">
        <section className="section-copy">
          <p className="eyebrow">Starter credits</p>
          <h2>See who is ready, pick recipients, and send the re-engagement email from here.</h2>
        </section>

        {starterCreditEligibleUsersQuery.isLoading ? (
          <p className="status-message">Loading starter-credit eligible users...</p>
        ) : null}

        <section className="panel">
          <div className="chip-row">
            <span className="chip">{starterCreditEligibleUsers.length} eligible users</span>
            <span className="chip chip-muted">
              {selectedStarterCreditRecipients.length} selected for email
            </span>
          </div>

          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              onClick={selectAllStarterCreditRecipients}
              disabled={!starterCreditEligibleUsers.length}
            >
              Select all
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={clearStarterCreditRecipients}
              disabled={!selectedStarterCreditRecipients.length}
            >
              Clear selection
            </button>
          </div>

          <div className="meta-group">
            <span className="meta-title">One-time email copy</span>
            <label className="field">
              <span>Subject</span>
              <input
                type="text"
                value={starterCreditEmailSubject}
                onChange={(event) => setStarterCreditEmailSubject(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Message</span>
              <textarea
                rows={14}
                value={starterCreditEmailMessage}
                onChange={(event) => setStarterCreditEmailMessage(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={
                starterCreditEmailMutation.isPending ||
                selectedStarterCreditRecipients.length === 0 ||
                starterCreditEmailSubject.trim().length < 4 ||
                starterCreditEmailMessage.trim().length < 20
              }
              onClick={() =>
                starterCreditEmailMutation.mutate({
                  profileIds: selectedStarterCreditRecipients.map((user) => user.profileId),
                  subject: starterCreditEmailSubject.trim(),
                  message: starterCreditEmailMessage.trim(),
                })
              }
            >
              {starterCreditEmailMutation.isPending
                ? "Sending starter-credit email..."
                : `Send to ${selectedStarterCreditRecipients.length} selected users`}
            </button>
            {starterCreditEmailMutation.isSuccess ? (
              <p className="status-message">
                Sent {starterCreditEmailMutation.data.sentCount} emails.
                {starterCreditEmailMutation.data.skippedCount
                  ? ` Skipped ${starterCreditEmailMutation.data.skippedCount}.`
                  : null}
              </p>
            ) : null}
            {starterCreditEmailMutation.error ? (
              <p className="form-error">
                {starterCreditEmailMutation.error instanceof Error
                  ? starterCreditEmailMutation.error.message
                  : "Unable to send starter-credit emails."}
              </p>
            ) : null}
          </div>
        </section>

        {activeAdminKey &&
        !starterCreditEligibleUsersQuery.isLoading &&
        starterCreditEligibleUsers.length === 0 ? (
          <section className="panel empty-state">
            <h2>No starter-credit candidates right now.</h2>
            <p>Everyone matching the current rule has either already been granted credits or does not qualify yet.</p>
          </section>
        ) : null}

        {starterCreditEligibleUsers.length > 0 ? (
          <section className="panel">
            <div className="meta-group">
              <span className="meta-title">Eligible users</span>
              <p>Pick exactly who you want to contact. Last emailed helps avoid repeats.</p>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Send</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Created</th>
                    <th>Credits</th>
                    <th>Last emailed</th>
                  </tr>
                </thead>
                <tbody>
                  {starterCreditEligibleUsers.map((user: StarterCreditEligibleUser) => (
                    <tr key={user.profileId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedStarterCreditProfileIds[user.profileId])}
                          onChange={() => toggleStarterCreditRecipient(user.profileId)}
                        />
                      </td>
                      <td>
                        {user.displayName} (@{user.username})
                      </td>
                      <td>{user.email}</td>
                      <td>{formatDateTime(user.userCreatedAt)}</td>
                      <td>{user.challengeCredits}</td>
                      <td>{user.lastEmailSentAt ? formatDateTime(user.lastEmailSentAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>

      <section className="content-section">
        <section className="section-copy">
          <p className="eyebrow">Support queue</p>
          <h2>User support tickets land here too.</h2>
        </section>

        {ticketsQuery.isLoading ? <p className="status-message">Loading support tickets...</p> : null}

        {activeAdminKey && !ticketsQuery.isLoading && tickets.length === 0 ? (
          <section className="panel empty-state">
            <h2>No support tickets yet.</h2>
            <p>The support page is wired, but nobody has asked for help yet.</p>
          </section>
        ) : null}

        <section className="card-grid">
          {tickets.map((ticket) => (
            <article className="card profile-card" key={ticket.id}>
              {(() => {
                const replyDraft = supportReplyDrafts[ticket.id] ?? {
                  subject: `Re: ${ticket.subject}`,
                  message: "",
                };

                return (
                  <>
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

                    <div className="meta-group">
                      <span className="meta-title">Reply from founder console</span>
                      <label className="field">
                        <span>Subject</span>
                        <input
                          type="text"
                          value={replyDraft.subject}
                          onChange={(event) => {
                            const nextSubject = event.target.value;
                            setSupportReplyDrafts((current) => ({
                              ...current,
                              [ticket.id]: {
                                ...replyDraft,
                                subject: nextSubject,
                              },
                            }));
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Reply</span>
                        <textarea
                          rows={5}
                          value={replyDraft.message}
                          onChange={(event) => {
                            const nextMessage = event.target.value;
                            setSupportReplyDrafts((current) => ({
                              ...current,
                              [ticket.id]: {
                                ...replyDraft,
                                message: nextMessage,
                              },
                            }));
                          }}
                          placeholder="Reply here. Velora will send this to the user's email."
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={
                          supportReplyMutation.isPending ||
                          !replyDraft.subject.trim() ||
                          replyDraft.message.trim().length < 10
                        }
                        onClick={() => {
                          supportReplyMutation.mutate({
                            ticketId: ticket.id,
                            subject: replyDraft.subject.trim(),
                            message: replyDraft.message.trim(),
                          });
                        }}
                      >
                        {supportReplyMutation.isPending ? "Sending reply..." : "Send reply"}
                      </button>
                      {supportReplyMutation.error ? (
                        <p className="form-error">
                          {supportReplyMutation.error instanceof Error
                            ? supportReplyMutation.error.message
                            : "Unable to send support reply."}
                        </p>
                      ) : null}
                    </div>
                  </>
                );
              })()}
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
