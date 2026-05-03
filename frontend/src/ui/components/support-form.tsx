import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { submitSupportTicket } from "../../lib/api";

export function SupportForm() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const supportMutation = useMutation({
    mutationFn: submitSupportTicket,
    onSuccess: () => {
      setSuccess("Support ticket sent. We can review it from the admin console.");
      setSubject("");
      setMessage("");
    },
  });

  return (
    <section className="panel form-panel">
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>

      <label className="field">
        <span>Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Issue with messages or account"
          required
        />
      </label>

      <label className="field">
        <span>Message</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell us what happened and what account or flow was involved."
          rows={5}
          required
        />
      </label>

      {supportMutation.error ? (
        <p className="form-error">
          {supportMutation.error instanceof Error
            ? supportMutation.error.message
            : "Unable to send support ticket."}
        </p>
      ) : null}

      {success ? <p className="success-message">{success}</p> : null}

      <button
        className="primary-button"
        type="button"
        disabled={supportMutation.isPending}
        onClick={() => {
          setSuccess("");
          supportMutation.mutate({ email, subject, message });
        }}
      >
        {supportMutation.isPending ? "Sending..." : "Send support ticket"}
      </button>
    </section>
  );
}
