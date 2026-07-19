import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  acceptLiveTriviaMatch,
  createDirectLiveTriviaMatch,
  createConversation,
  declineLiveTriviaMatch,
  fetchLiveTriviaStatus,
  joinLiveTriviaQueue,
  leaveLiveTriviaMatch,
  leaveLiveTriviaQueue,
  submitLiveTriviaAnswer,
  type LiveTriviaStatus,
} from "../../lib/api";

function getWaitingCopy(status: LiveTriviaStatus) {
  if (status.match) {
    return `You are live with ${status.match.otherProfile?.displayName ?? "another person"}.`;
  }

  if (status.queued) {
    return "You are in the queue now. Leave this page open and we will auto-match you as soon as someone compatible is active.";
  }

  return "Jump into a live trivia round when someone else is active right now.";
}

function getWinnerCopy(match: NonNullable<LiveTriviaStatus["match"]>) {
  if (match.winner === "tie") {
    return "Tie game";
  }

  return match.winner === "you"
    ? "You won this live round"
    : `${match.otherProfile?.displayName ?? "Your opponent"} won this round`;
}

export function LiveTriviaPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const statusQuery = useQuery({
    queryKey: ["liveTrivia"],
    queryFn: fetchLiveTriviaStatus,
    refetchInterval: 1000,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => window.clearInterval(interval);
  }, []);

  const joinMutation = useMutation({
    mutationFn: joinLiveTriviaQueue,
    onSuccess: async () => {
      setSelectedAnswerIndex(null);
      await queryClient.invalidateQueries({ queryKey: ["liveTrivia"] });
    },
  });

  const directMatchMutation = useMutation({
    mutationFn: (targetProfileId: string) => createDirectLiveTriviaMatch(targetProfileId),
    onSuccess: async () => {
      setSelectedAnswerIndex(null);
      await queryClient.invalidateQueries({ queryKey: ["liveTrivia"] });
      await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
    },
  });

  const leaveQueueMutation = useMutation({
    mutationFn: leaveLiveTriviaQueue,
    onSuccess: async () => {
      setSelectedAnswerIndex(null);
      await queryClient.invalidateQueries({ queryKey: ["liveTrivia"] });
    },
  });

  const acceptMatchMutation = useMutation({
    mutationFn: acceptLiveTriviaMatch,
    onSuccess: async () => {
      setSelectedAnswerIndex(null);
      await queryClient.invalidateQueries({ queryKey: ["liveTrivia"] });
      await queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
    },
  });

  const declineMatchMutation = useMutation({
    mutationFn: declineLiveTriviaMatch,
    onSuccess: async () => {
      setSelectedAnswerIndex(null);
      await queryClient.invalidateQueries({ queryKey: ["liveTrivia"] });
    },
  });

  const submitAnswerMutation = useMutation({
    mutationFn: ({
      matchId,
      questionIndex,
      answerIndex,
    }: {
      matchId: string;
      questionIndex: number;
      answerIndex: number;
    }) => submitLiveTriviaAnswer(matchId, { questionIndex, answerIndex }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["liveTrivia"] });
      const previousStatus = queryClient.getQueryData<LiveTriviaStatus>(["liveTrivia"]);
      return { previousStatus };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(["liveTrivia"], context.previousStatus);
      }
      setSelectedAnswerIndex(null);
    },
    onSuccess: async (result) => {
      setSelectedAnswerIndex(null);
      queryClient.setQueryData<LiveTriviaStatus>(["liveTrivia"], (previousStatus) =>
        previousStatus
          ? {
              ...previousStatus,
              match: result.match,
            }
          : previousStatus,
      );
      await queryClient.invalidateQueries({ queryKey: ["liveTrivia"] });
    },
  });

  const leaveMatchMutation = useMutation({
    mutationFn: leaveLiveTriviaMatch,
    onSuccess: async () => {
      setSelectedAnswerIndex(null);
      await queryClient.invalidateQueries({ queryKey: ["liveTrivia"] });
    },
  });

  const chatMutation = useMutation({
    mutationFn: () =>
      createConversation(statusQuery.data?.match?.otherProfile?.id ?? ""),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/chat/${result.conversation.id}`);
    },
  });

  if (statusQuery.isLoading) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="status-message">Loading live trivia...</p>
        </section>
      </main>
    );
  }

  if (statusQuery.error || !statusQuery.data) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="error-message">
            {statusQuery.error instanceof Error
              ? statusQuery.error.message
              : "Unable to load live trivia right now."}
          </p>
        </section>
      </main>
    );
  }

  const status = statusQuery.data;
  const match = status.match;
  const canSubmitCurrentAnswer =
    Boolean(match?.currentQuestion) &&
    selectedAnswerIndex !== null;
  const secondsRemaining = match?.roundDeadlineAt
    ? Math.max(0, Math.ceil((match.roundDeadlineAt - now) / 1000))
    : 0;
  const ownFinishedAnswering =
    match?.status === "active" &&
    !match.finished &&
    !match.currentQuestion;

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Live Arena</p>
        <h1>Start a live trivia round when someone else is online.</h1>
      </section>

      <section className="panel">
        <div className="chip-row">
          <span className="chip">{status.activePlayerCount} active now</span>
          <span className="chip">{status.creditBalance} credit{status.creditBalance === 1 ? "" : "s"} ready</span>
          <span className="chip chip-muted">2 people per round</span>
          <span className="chip chip-muted">Beta feature</span>
        </div>

        <p className="status-message">{getWaitingCopy(status)}</p>

        {!match ? (
          <div className="meta-group">
            <span className="meta-title">How it works</span>
            <p className="status-message">
              Live trivia uses the same challenge credit system. Only the person who starts the
              match spends 1 credit when the round begins. If you are already waiting in the queue
              and someone joins you, they spend the credit.
            </p>
          </div>
        ) : null}

        {status.onlineProfiles.length > 0 && !match ? (
          <div className="meta-group">
            <span className="meta-title">Online now</span>
            <div className="content-section">
              {status.onlineProfiles.map((profile) => (
                <div className="panel form-panel" key={profile.id}>
                  <div className="meta-group">
                    <h2>{profile.displayName}</h2>
                    <p>@{profile.username}</p>
                  </div>
                  <div className="chip-row">
                    <span className="chip">{profile.personalityType}</span>
                    <span className="chip chip-muted">{profile.identity}</span>
                  </div>
                  <div className="action-row">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={
                        directMatchMutation.isPending || status.creditBalance < 1
                      }
                      onClick={() => directMatchMutation.mutate(profile.id)}
                    >
                      {directMatchMutation.isPending
                        ? "Starting..."
                        : "Invite to live round"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!status.queued && !match ? (
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              disabled={joinMutation.isPending}
              onClick={() => joinMutation.mutate()}
            >
              {joinMutation.isPending ? "Joining..." : "Join live trivia queue"}
            </button>
            <Link className="secondary-button" to="/challenges">
              Back to challenges
            </Link>
          </div>
        ) : null}

        {status.queued && !match ? (
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              disabled={leaveQueueMutation.isPending}
              onClick={() => leaveQueueMutation.mutate()}
            >
              {leaveQueueMutation.isPending ? "Leaving..." : "Leave queue"}
            </button>
          </div>
        ) : null}

        {match ? (
          <div className="content-section">
            <section className="panel">
              <div className="meta-group">
                <span className="meta-title">Current opponent</span>
                <h2>{match.otherProfile?.displayName ?? "Another person"}</h2>
                <p>@{match.otherProfile?.username ?? "live-player"}</p>
              </div>

              <div className="chip-row">
                <span className="chip">
                  You: {match.ownScore} / {match.questionCount}
                </span>
                <span className="chip chip-muted">
                  {match.otherProfile?.displayName ?? "They"}: {match.otherScore} / {match.questionCount}
                </span>
                <span className="chip chip-muted">
                  Answered {match.ownAnsweredCount} / {match.questionCount}
                </span>
                {match.status === "pending" ? (
                  <span className="chip chip-muted">Invite pending</span>
                ) : !match.finished ? (
                  <span className={secondsRemaining <= 10 ? "chip" : "chip chip-muted"}>
                    {secondsRemaining}s left
                  </span>
                ) : null}
              </div>

              {!match.finished ? (
                <p className="status-message">
                  {match.status === "pending"
                    ? "This live round is waiting for a response."
                    : ownFinishedAnswering
                      ? `You finished your ${match.questionCount} questions. Waiting for ${match.otherProfile?.displayName ?? "the other person"} or for the round timer to end.`
                    : `Question ${match.currentQuestionIndex + 1} of ${match.questionCount}`}
                </p>
              ) : (
                <p className="status-message">This live round is complete.</p>
              )}
            </section>

            {match.status === "pending" ? (
              <section className="panel">
                <div className="meta-group">
                  <span className="meta-title">Invite</span>
                  <p className="status-message">
                    {status.queued
                      ? `Waiting for ${match.otherProfile?.displayName ?? "the other person"} to respond to your live invite.`
                      : `${match.otherProfile?.displayName ?? "Someone"} invited you to a live trivia round.`}
                  </p>
                </div>

                <div className="action-row">
                  {match.isInviter ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={leaveMatchMutation.isPending}
                      onClick={() => leaveMatchMutation.mutate(match.id)}
                    >
                      {leaveMatchMutation.isPending ? "Canceling..." : "Cancel invite"}
                    </button>
                  ) : (
                    <>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={acceptMatchMutation.isPending}
                        onClick={() => acceptMatchMutation.mutate(match.id)}
                      >
                        {acceptMatchMutation.isPending ? "Accepting..." : "Accept live round"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={declineMatchMutation.isPending}
                        onClick={() => declineMatchMutation.mutate(match.id)}
                      >
                        {declineMatchMutation.isPending ? "Declining..." : "Decline"}
                      </button>
                    </>
                  )}
                </div>
              </section>
            ) : null}

            {match.currentQuestion && !match.finished && match.status === "active" ? (
              <section className="panel form-panel">
                <div className="meta-group">
                  <span className="meta-title">{match.currentQuestion.category}</span>
                  <h2>{match.currentQuestion.prompt}</h2>
                </div>

                <div className="chip-row">
                  {match.currentQuestion.options.map((option, optionIndex) => (
                    <button
                      key={`${match.currentQuestion?.id}-${option}`}
                      className={
                        selectedAnswerIndex === optionIndex
                          ? "primary-button"
                          : "secondary-button"
                      }
                      type="button"
                      onClick={() => setSelectedAnswerIndex(optionIndex)}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <button
                  className="primary-button"
                  type="button"
                  disabled={!canSubmitCurrentAnswer || submitAnswerMutation.isPending}
                  onClick={() => {
                    if (!match.currentQuestion || selectedAnswerIndex === null) {
                      return;
                    }

                    submitAnswerMutation.mutate({
                      matchId: match.id,
                      questionIndex: match.currentQuestionIndex,
                      answerIndex: selectedAnswerIndex,
                    });
                  }}
                >
                  {submitAnswerMutation.isPending ? "Saving answer..." : "Next question"}
                </button>
              </section>
            ) : null}

            {ownFinishedAnswering ? (
              <section className="panel">
                <div className="meta-group">
                  <span className="meta-title">You are done</span>
                  <h2>Your answers are locked in</h2>
                  <p className="status-message">
                    You answered {match.ownAnsweredCount} of {match.questionCount}. The round will
                    finish when {match.otherProfile?.displayName ?? "the other person"} is done or
                    when the 75-second round timer ends.
                  </p>
                </div>
              </section>
            ) : null}

            {match.finished ? (
              <>
                <section className="panel">
                  <div className="meta-group">
                    <span className="meta-title">Result</span>
                    <h2>{getWinnerCopy(match)}</h2>
                    <p>
                      This round stays light and social, so the full answer key is visible after both
                      sides are done.
                    </p>
                  </div>
                </section>

                <section className="panel">
                  <div className="meta-group">
                    <span className="meta-title">Answer key</span>
                    {match.correctAnswers.map((item) => (
                      <p key={item.questionId}>
                        [{item.category}] {item.prompt} - {item.answer}
                      </p>
                    ))}
                  </div>
                </section>

                <div className="action-row">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={chatMutation.isPending}
                    onClick={() => chatMutation.mutate()}
                  >
                    {chatMutation.isPending ? "Opening..." : "Open chat"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={directMatchMutation.isPending || !match.otherProfile?.id}
                    onClick={() => {
                      if (!match.otherProfile?.id) {
                        return;
                      }

                      directMatchMutation.mutate(match.otherProfile.id);
                    }}
                  >
                    {directMatchMutation.isPending ? "Sending..." : "Play again"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={leaveMatchMutation.isPending}
                    onClick={() => leaveMatchMutation.mutate(match.id)}
                  >
                    {leaveMatchMutation.isPending ? "Leaving..." : "Find someone else"}
                  </button>
                </div>
              </>
            ) : null}

            {!match.finished ? (
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={leaveMatchMutation.isPending}
                  onClick={() => leaveMatchMutation.mutate(match.id)}
                >
                  {leaveMatchMutation.isPending ? "Leaving..." : "Leave round"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {joinMutation.error ||
        directMatchMutation.error ||
        leaveQueueMutation.error ||
        acceptMatchMutation.error ||
        declineMatchMutation.error ||
        submitAnswerMutation.error ||
        leaveMatchMutation.error ||
        chatMutation.error ? (
          <p className="form-error">
            {joinMutation.error instanceof Error
              ? joinMutation.error.message
              : directMatchMutation.error instanceof Error
                ? directMatchMutation.error.message
                : leaveQueueMutation.error instanceof Error
                  ? leaveQueueMutation.error.message
                  : acceptMatchMutation.error instanceof Error
                    ? acceptMatchMutation.error.message
                    : declineMatchMutation.error instanceof Error
                      ? declineMatchMutation.error.message
                      : submitAnswerMutation.error instanceof Error
                        ? submitAnswerMutation.error.message
                        : leaveMatchMutation.error instanceof Error
                          ? leaveMatchMutation.error.message
                          : chatMutation.error instanceof Error
                            ? chatMutation.error.message
                            : "Something went wrong."}
          </p>
        ) : null}
      </section>
    </main>
  );
}
