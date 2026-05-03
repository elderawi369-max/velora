import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMessages, sendMessage } from "../../lib/api";

type ChatPanelProps = {
  conversationId: string;
};

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

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
          <div className="empty-state">
            <h2>No messages yet.</h2>
            <p>Send the first message and start shaping the tone of the connection.</p>
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
      </div>

      <form className="panel composer" onSubmit={handleSubmit}>
        <label className="field">
          <span>Message</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Keep the conversation inside Velora."
            rows={4}
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
