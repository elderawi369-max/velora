import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { reportAiCompanionMessage, type AiCompanionCallLog } from "../../lib/api";
import { CompanionVoiceNote } from "./companion-voice-note";

type ReportReason = "unsafe" | "harmful" | "sexual_content" | "misleading" | "other";

function formatCallDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function formatCallDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function CompanionCallDetails({ call, companionId, companionName, onClose }: { call: AiCompanionCallLog; companionId: string; companionName: string; onClose: () => void }) {
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("unsafe");
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<string>>(() => new Set());
  const reportMutation = useMutation({
    mutationFn: (messageId: string) => reportAiCompanionMessage(messageId, { reason: reportReason }),
    onSuccess: (_result, messageId) => {
      setReportedMessageIds((current) => new Set(current).add(messageId));
      setReportingMessageId(null);
    },
  });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const startedAt = call.connectedAt ?? call.createdAt;

  return <div className="ai-call-details-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-call-details-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ai-call-details-sheet">
      <header className="ai-call-details-header">
        <div className="ai-call-details-icon" aria-hidden="true">📞</div>
        <div>
          <p className="eyebrow">CALL DETAILS</p>
          <h2 id="ai-call-details-title">Voice call with {companionName}</h2>
          <p><time dateTime={new Date(startedAt).toISOString()}>{formatCallDate(startedAt)}</time><span aria-hidden="true"> · </span>{formatCallDuration(call.durationSeconds)}</p>
        </div>
        <button className="ai-call-details-close" type="button" aria-label="Close call details" onClick={onClose}>×</button>
      </header>

      <div className="ai-call-details-notice">Transcript generated automatically and may contain mistakes</div>

      <div className="ai-call-details-turns">
        {call.turns.map((turn) => <article className="ai-call-details-turn" key={turn.id}>
          <div className="ai-call-details-speaker ai-call-details-user">
            <strong>You</strong>
            <p>{turn.userText}</p>
          </div>
          {turn.assistantText ? <div className="ai-call-details-speaker ai-call-details-companion">
            <strong>{companionName}</strong>
            <p>{turn.assistantText}</p>
            {turn.voiceAsset ? <CompanionVoiceNote companionId={companionId} asset={turn.voiceAsset} transcript={turn.assistantText} transcriptControl={false} /> : null}
            {turn.assistantMessageId ? <div className="ai-call-details-report">
              {reportedMessageIds.has(turn.assistantMessageId) ? <span>Response reported. Thank you.</span> : <button className="text-button" type="button" onClick={() => setReportingMessageId((current) => current === turn.assistantMessageId ? null : turn.assistantMessageId)}>Report response</button>}
              {reportingMessageId === turn.assistantMessageId ? <div className="ai-report">
                <select aria-label="Report reason" value={reportReason} onChange={(event) => setReportReason(event.target.value as ReportReason)}>
                  <option value="unsafe">Unsafe or crisis handling</option>
                  <option value="harmful">Harmful or manipulative</option>
                  <option value="sexual_content">Sexual content</option>
                  <option value="misleading">Misleading</option>
                  <option value="other">Other</option>
                </select>
                <button className="secondary-button" type="button" onClick={() => reportMutation.mutate(turn.assistantMessageId!)} disabled={reportMutation.isPending}>Submit report</button>
                {reportMutation.error ? <p className="form-error">{reportMutation.error.message}</p> : null}
              </div> : null}
            </div> : null}
          </div> : null}
        </article>)}
      </div>
    </section>
  </div>;
}
