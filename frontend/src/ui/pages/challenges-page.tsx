import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchChallenges } from "../../lib/api";

function formatChallengeTiming(status: string, expiresAt: number, completedAt: number | null) {
  if (status === "completed") {
    return completedAt ? "Finished" : "Completed";
  }

  if (status === "declined") {
    return "Declined";
  }

  if (status === "canceled") {
    return "Canceled";
  }

  if (status === "expired") {
    return "Expired";
  }

  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) {
    return "Expired";
  }

  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return `${diffHours}h left`;
  }

  const diffDays = Math.ceil(diffHours / 24);
  return `${diffDays}d left`;
}

function getChallengeLabel(status: string, isSender: boolean) {
  if (status === "completed") {
    return "Completed";
  }

  if (status === "declined") {
    return "Declined";
  }

  if (status === "canceled") {
    return "Canceled";
  }

  if (status === "expired") {
    return "Expired";
  }

  if (status === "accepted") {
    return isSender ? "They joined" : "Ready for you";
  }

  return isSender ? "Waiting for them" : "New challenge";
}

export function ChallengesPage() {
  const challengeQuery = useQuery({
    queryKey: ["challenges"],
    queryFn: fetchChallenges,
    refetchInterval: 8000,
  });

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Break The Ice</p>
        <h1>Challenges help conversations start with energy instead of a cold hello.</h1>
      </section>

      <div className="action-row">
        <Link className="primary-button" to="/browse">
          Start another challenge
        </Link>
      </div>

      {challengeQuery.isLoading ? <p className="status-message">Loading challenges...</p> : null}

      {challengeQuery.error ? (
        <section className="panel">
          <p className="error-message">
            {challengeQuery.error instanceof Error
              ? challengeQuery.error.message
              : "Unable to load challenges."}
          </p>
        </section>
      ) : null}

      {!challengeQuery.isLoading &&
      !challengeQuery.error &&
      (challengeQuery.data?.challenges.length ?? 0) === 0 ? (
        <section className="panel empty-state">
          <h2>No challenges yet.</h2>
          <p>Open a profile, send a Vibe Check, and give the chat a better starting point.</p>
          <div className="action-row">
            <Link className="primary-button" to="/browse">
              Browse profiles
            </Link>
          </div>
        </section>
      ) : null}

      <section className="card-grid">
        {(challengeQuery.data?.challenges ?? []).map((challenge) => (
          <article className="card profile-card" key={challenge.id}>
            <div className="chip-row">
              <span className="chip">{challenge.typeLabel}</span>
              <span className={challenge.status === "completed" ? "chip" : "chip chip-muted"}>
                {getChallengeLabel(challenge.status, challenge.isSender)}
              </span>
            </div>

            <div className="meta-group">
              <h2>{challenge.otherProfile?.displayName ?? "Unknown profile"}</h2>
              <p>@{challenge.otherProfile?.username ?? "missing-profile"}</p>
            </div>

            <p>
              {challenge.isSender
                ? `You sent this ${challenge.type === "trivia" ? "trivia challenge" : "challenge"}.`
                : `This ${challenge.type === "trivia" ? "trivia challenge" : "challenge"} was sent to you.`}
            </p>

            <div className="chip-row">
              <span className="chip chip-muted">
                {formatChallengeTiming(
                  challenge.status,
                  challenge.expiresAt,
                  challenge.completedAt,
                )}
              </span>
            </div>

            <div className="action-row">
              <Link className="primary-button" to={`/challenges/${challenge.id}`}>
                Open challenge
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
