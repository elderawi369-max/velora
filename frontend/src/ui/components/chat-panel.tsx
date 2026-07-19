import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMessages, sendMessage } from "../../lib/api";

type ChatPanelProps = {
  conversationId: string;
  otherProfile?: {
    displayName: string;
    personalityType: string;
    promptEntries?: Array<{ question: string; answer: string }>;
    vibeTags?: string[];
  } | null;
  initialDraft?: string;
};

function getOpenerSuggestions(otherProfile?: ChatPanelProps["otherProfile"]) {
  if (!otherProfile) {
    return [
      "What kind of conversation are you hoping for tonight?",
      "What usually makes a chat feel easy for you?",
      "What mood are you in right now?",
    ];
  }

  const promptAnswer = otherProfile.promptEntries?.find((entry) => entry.answer.trim().length > 0);
  const firstVibe = otherProfile.vibeTags?.[0];

  return [
    promptAnswer
      ? `${otherProfile.displayName}, your profile mentioned "${promptAnswer.answer}". What makes that especially fun for you?`
      : `What kind of ${otherProfile.personalityType} energy feels best for you tonight?`,
    firstVibe
      ? `I noticed your ${firstVibe} vibe. What does that usually look like in chat?`
      : `What kind of opener usually gets your attention here?`,
    `What kind of conversation are you hoping to build on Velora?`,
  ];
}

export function ChatPanel({
  conversationId,
  otherProfile = null,
  initialDraft = "",
}: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const messageQuery = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages(conversationId),
    refetchInterval: 4000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMessage(conversationId, body),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"],
      });
    },
  });

  const ownProfileId = messageQuery.data?.ownProfileId ?? "";
  const messages = useMemo(() => messageQuery.data?.messages ?? [], [messageQuery.data]);
  const openerSuggestions = useMemo(() => getOpenerSuggestions(otherProfile), [otherProfile]);

  useEffect(() => {
    if (!initialDraft || draft.trim().length > 0) {
      return;
    }

    setDraft(initialDraft);
  }, [draft, initialDraft]);

  useEffect(() => {
    if (!messageQuery.data) {
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: ["conversations"],
    });

    void queryClient.invalidateQueries({
      queryKey: ["conversation", conversationId],
    });
  }, [conversationId, messageQuery.data, queryClient]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.trim()) {
      return;
    }

    await sendMutation.mutateAsync(draft);
  }

  if (messageQuery.isLoading) {
    return <p className="status-message">Loading messages...</p>;
  }

  if (messageQuery.error) {
    return (
      <div className="panel">
        <p className="error-message">
          {messageQuery.error instanceof Error
            ? messageQuery.error.message
            : "Unable to load messages."}
        </p>
      </div>
    );
  }

  return (
    <section className="chat-layout">
      <div className="panel message-list">
        {messages.length === 0 ? (
          <div className="empty-state chat-empty-state">
            <h2>Start the conversation.</h2>
            <p>Open with something warm, specific, or playful so the reply feels easy.</p>
            <div className="chip-row">
              {openerSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="tag-button"
                  type="button"
                  onClick={() => setDraft(suggestion)}
                >
                  Use opener
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.senderProfileId === ownProfileId;
            return (
              <article
                className={isOwnMessage ? "message-bubble own-message" : "message-bubble"}
                key={message.id}
              >
                <p>{message.body}</p>
              </article>
            );
          })
        )}
        <div ref={messageEndRef} />
      </div>

      <form className="panel composer" onSubmit={handleSubmit}>
        {messages.length === 0 ? (
          <div className="meta-group">
            <span className="meta-title">Suggested openers</span>
            <div className="chip-row">
              {openerSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="tag-button"
                  type="button"
                  onClick={() => setDraft(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label className="field">
          <span>{messages.length === 0 ? "First message" : "Reply"}</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Keep the conversation inside Velora."
            rows={messages.length === 0 ? 4 : 3}
            maxLength={1200}
          />
        </label>
        {sendMutation.error ? (
          <p className="form-error">
            {sendMutation.error instanceof Error
              ? sendMutation.error.message
              : "Unable to send message."}
          </p>
        ) : null}
        <button
          className="primary-button"
          type="submit"
          disabled={sendMutation.isPending}
        >
          {sendMutation.isPending ? "Sending..." : "Send message"}
        </button>
      </form>
    </section>
  );
}
