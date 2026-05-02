import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { blockProfile, reportProfile } from "../../lib/api";

type ChatSafetyPanelProps = {
  conversationId: string;
  targetProfileId: string;
};

export function ChatSafetyPanel({
  conversationId,
  targetProfileId,
}: ChatSafetyPanelProps) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [success, setSuccess] = useState("");

  const reportMutation = useMutation({
    mutationFn: () =>
      reportProfile({
        targetProfileId,
        conversationId,
        reason,
        details,
      }),
    onSuccess: () => {
      setSuccess("Report submitted.");
      setDetails("");
    },
  });

  const blockMutation = useMutation({
    mutationFn: () => blockProfile(targetProfileId),
    onSuccess: () => {
      setSuccess("Profile blocked.");
    },
  });

  return (
    <aside className="panel safety-panel">
      <h2>Safety controls</h2>
      <p className="status-message">
        Use these tools if someone crosses boundaries, spams, or tries to move
        the conversation off-platform.
      </p>

      <label className="field">
        <span>Report reason</span>
        <select value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="spam">Spam</option>
          <option value="harassment">Harassment</option>
          <option value="off-platform contact">Off-platform contact</option>
          <option value="impersonation">Impersonation</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="field">
        <span>Details</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={3}
          placeholder="Add optional context for review."
        />
      </label>

      <div className="action-row">
        <button
          className="secondary-button"
          type="button"
          disabled={reportMutation.isPending}
          onClick={() => {
            setSuccess("");
            reportMutation.mutate();
          }}
        >
          {reportMutation.isPending ? "Reporting..." : "Report"}
        </button>
        <button
          className="danger-button"
          type="button"
          disabled={blockMutation.isPending}
          onClick={() => {
            setSuccess("");
            blockMutation.mutate();
          }}
        >
          {blockMutation.isPending ? "Blocking..." : "Block"}
        </button>
      </div>

      {reportMutation.error ? (
        <p className="form-error">
          {reportMutation.error instanceof Error
            ? reportMutation.error.message
            : "Unable to report profile."}
        </p>
      ) : null}

      {blockMutation.error ? (
        <p className="form-error">
          {blockMutation.error instanceof Error
            ? blockMutation.error.message
            : "Unable to block profile."}
        </p>
      ) : null}

      {success ? <p className="success-message">{success}</p> : null}
    </aside>
  );
}

