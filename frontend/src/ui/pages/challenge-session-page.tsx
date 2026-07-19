import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  acceptChallenge,
  cancelChallenge,
  createConversation,
  declineChallenge,
  fetchChallenge,
  submitChallengeAnswers,
} from "../../lib/api";

function getSuggestedFollowUp(result: {
  matchedPrompts: Array<{ prompt: string; answer: string }>;
  mismatchedPrompts: Array<{ prompt: string; senderAnswer: string; recipientAnswer: string }>;
}) {
  const firstMismatch = result.mismatchedPrompts[0];
  if (firstMismatch) {
    return `We answered "${firstMismatch.prompt}" differently. I picked "${firstMismatch.senderAnswer}" and now I need your defense.`;
  }

  const firstMatch = result.matchedPrompts[0];
  if (firstMatch) {
    return `We matched on "${firstMatch.answer}" for "${firstMatch.prompt}". That feels like a good place to start.`;
  }

  return "That was a fun start. What answer surprised you most?";
}

export function ChallengeSessionPage() {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<number[]>([]);

  const challengeId = params.challengeId ?? "";
  const challengeQuery = useQuery({
    queryKey: ["challenge", challengeId],
    queryFn: () => fetchChallenge(challengeId),
    enabled: Boolean(challengeId),
    refetchInterval: 5000,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptChallenge(challengeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenge", challengeId] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => declineChallenge(challengeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      navigate("/challenges");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelChallenge(challengeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenge", challengeId] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      navigate("/challenges");
    },
  });

  const submitMutation = useMutation({
    mutationFn: (submittedAnswers: number[]) =>
      submitChallengeAnswers(challengeId, submittedAnswers),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenge", challengeId] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
  });

  const chatMutation = useMutation({
    mutationFn: () =>
      createConversation(challengeQuery.data?.challenge.otherProfile?.id ?? ""),
    onSuccess: async (result) => {
      const challenge = challengeQuery.data?.challenge;
      const draft = challenge?.result ? getSuggestedFollowUp(challenge.result) : "";
      const encodedDraft = draft ? `?draft=${encodeURIComponent(draft)}` : "";
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/chat/${result.conversation.id}${encodedDraft}`);
    },
  });

  const challenge = challengeQuery.data?.challenge;
  const canAnswer = useMemo(() => {
    if (!challenge || challenge.ownResponse) {
      return false;
    }

    if (challenge.status === "accepted") {
      return true;
    }

    return challenge.status === "pending" && challenge.isSender;
  }, [challenge]);

  function updateAnswer(index: number, answerIndex: number) {
    setAnswers((current) => {
      const next = [...current];
      next[index] = answerIndex;
      return next;
    });
  }

  if (challengeQuery.isLoading) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="status-message">Loading challenge...</p>
        </section>
      </main>
    );
  }

  if (challengeQuery.error || !challenge) {
    return (
      <main className="content-section">
        <section className="panel">
          <p className="error-message">
            {challengeQuery.error instanceof Error
              ? challengeQuery.error.message
              : "Unable to load this challenge."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="content-section">
      <section className="section-copy">
        <p className="eyebrow">Break The Ice</p>
        <h1>Vibe Check with {challenge.otherProfile?.displayName ?? "this profile"}.</h1>
      </section>

      <section className="panel">
        <div className="chip-row">
          <span className="chip">Compatibility</span>
          <span className="chip chip-muted">{challenge.status}</span>
        </div>

        {challenge.status === "pending" && challenge.isRecipient ? (
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
            >
              {acceptMutation.isPending ? "Accepting..." : "Accept challenge"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={declineMutation.isPending}
              onClick={() => declineMutation.mutate()}
            >
              {declineMutation.isPending ? "Declining..." : "Decline"}
            </button>
          </div>
        ) : null}

        {challenge.status === "pending" && challenge.isSender ? (
          <div className="meta-group">
            <p className="status-message">
              This Vibe Check is waiting for {challenge.otherProfile?.displayName ?? "them"} to accept.
            </p>
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? "Canceling..." : "Cancel challenge"}
              </button>
            </div>
          </div>
        ) : null}

        {challenge.status === "canceled" ? (
          <p className="status-message">
            This Vibe Check was canceled before it was accepted.
          </p>
        ) : null}

        {canAnswer ? (
          <div className="content-section">
            {challenge.questions.map((question, index) => (
              <section className="panel form-panel" key={question.id}>
                <div className="meta-group">
                  <span className="meta-title">Question {index + 1}</span>
                  <h2>{question.prompt}</h2>
                </div>
                <div className="chip-row">
                  {question.options.map((option, optionIndex) => (
                    <button
                      key={`${question.id}-${option}`}
                      className={
                        answers[index] === optionIndex
                          ? "primary-button"
                          : "secondary-button"
                      }
                      type="button"
                      onClick={() => updateAnswer(index, optionIndex)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </section>
            ))}

            <button
              className="primary-button"
              type="button"
              disabled={
                submitMutation.isPending ||
                answers.length !== challenge.questions.length ||
                answers.some((answer) => typeof answer !== "number")
              }
              onClick={() => submitMutation.mutate(answers)}
            >
              {submitMutation.isPending ? "Submitting..." : "Finish Vibe Check"}
            </button>
          </div>
        ) : null}

        {challenge.ownResponse && challenge.status !== "completed" ? (
          <p className="status-message">
            You finished your side. We'll reveal the result once {challenge.otherProfile?.displayName ?? "they"} finish too.
          </p>
        ) : null}

        {challenge.result ? (
          <div className="content-section">
            <section className="panel">
              <div className="meta-group">
                <span className="meta-title">Result</span>
                <h2>{challenge.result.compatibilityPercent}% match</h2>
                <p>
                  {challenge.result.matchedCount} of {challenge.questions.length} answers aligned.
                </p>
              </div>
            </section>

            {challenge.result.matchedPrompts.length > 0 ? (
              <section className="panel">
                <div className="meta-group">
                  <span className="meta-title">You matched on</span>
                  {challenge.result.matchedPrompts.map((item) => (
                    <p key={item.questionId}>[Match] {item.answer}</p>
                  ))}
                </div>
              </section>
            ) : null}

            {challenge.result.mismatchedPrompts.length > 0 ? (
              <section className="panel">
                <div className="meta-group">
                  <span className="meta-title">Good conversation starters</span>
                  {challenge.result.mismatchedPrompts.map((item) => (
                    <p key={item.questionId}>[Talk about] {item.prompt}</p>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                disabled={chatMutation.isPending}
                onClick={() => chatMutation.mutate()}
              >
                {chatMutation.isPending ? "Opening..." : "Start chatting"}
              </button>
              <Link
                className="secondary-button"
                to={`/browse/${challenge.otherProfile?.username ?? ""}`}
              >
                Back to profile
              </Link>
            </div>
          </div>
        ) : null}

        {acceptMutation.error ||
        declineMutation.error ||
        cancelMutation.error ||
        submitMutation.error ||
        chatMutation.error ? (
          <p className="form-error">
            {acceptMutation.error instanceof Error
              ? acceptMutation.error.message
              : declineMutation.error instanceof Error
                ? declineMutation.error.message
                : cancelMutation.error instanceof Error
                  ? cancelMutation.error.message
                  : submitMutation.error instanceof Error
                    ? submitMutation.error.message
                    : chatMutation.error instanceof Error
                      ? chatMutation.error.message
                      : "Something went wrong."}
          </p>
        ) : null}
      </section>
    </main>
  );
}
