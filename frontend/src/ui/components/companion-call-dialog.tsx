import { useEffect, useRef, useState } from "react";
import { endAiCompanionCall, fetchAiCompanionVoiceAudio, heartbeatAiCompanionCall, sendAiCompanionCallTurn, startAiCompanionCall, type AiCompanion, type AiCompanionVoiceCapabilities } from "../../lib/api";

type CallState = "ready" | "calling" | "listening" | "thinking" | "speaking" | "muted" | "reconnecting" | "ended";

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;
}

export function CompanionCallDialog({ companion, capabilities, onClose, onConversationChanged }: { companion: AiCompanion; capabilities: AiCompanionVoiceCapabilities; onClose: () => void; onConversationChanged: () => void }) {
  const [state, setState] = useState<CallState>("ready");
  const [callId, setCallId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState(capabilities.calls.monthlySeconds);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const replyUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!callId || state === "ended") return;
    const tick = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    const heartbeat = window.setInterval(() => {
      heartbeatAiCompanionCall(companion.id, callId).then((usage) => { setRemaining(usage.remainingSeconds); setState((current) => usage.ended ? "ended" : current === "reconnecting" ? "listening" : current); }).catch(() => setState((current) => current === "ended" ? current : "reconnecting"));
    }, 10_000);
    return () => { window.clearInterval(tick); window.clearInterval(heartbeat); };
  }, [callId, companion.id, state]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    replyAudioRef.current?.pause();
    if (replyUrlRef.current) URL.revokeObjectURL(replyUrlRef.current);
  }, []);

  async function beginCall() {
    setState("calling"); setError(null);
    try {
      const result = await startAiCompanionCall(companion.id);
      setCallId(result.call.id); setRemaining(result.call.maxSeconds); setState("listening");
    } catch (nextError) { setState("ready"); setError(nextError instanceof Error ? nextError.message : "The call could not start."); }
  }

  async function startTurn() {
    if (!callId || state === "thinking" || state === "muted") return;
    replyAudioRef.current?.pause();
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Voice calls need microphone access in a supported browser or the Velora app."); return; }
    try {
      const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => { setIsRecording(false); void submitTurn(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })); };
      recorderRef.current = recorder;
      recorder.start(); setIsRecording(true); setState("listening");
    } catch { setError("Microphone access is needed for a companion call."); }
  }

  function stopTurn() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop(); setState("thinking");
  }

  async function submitTurn(blob: Blob) {
    if (!callId) return;
    setState("thinking");
    try {
      const result = await sendAiCompanionCallTurn(companion.id, callId, blob);
      setLastTranscript(result.transcript); setRemaining(result.call.remainingSeconds); onConversationChanged();
      if (replyUrlRef.current) URL.revokeObjectURL(replyUrlRef.current);
      const url = await fetchAiCompanionVoiceAudio(companion.id, result.voiceAsset.id);
      replyUrlRef.current = url;
      const audio = new Audio(url); replyAudioRef.current = audio;
      audio.onended = () => setState("listening");
      audio.onerror = () => { setError("The reply was saved, but audio playback failed."); setState("listening"); };
      setState("speaking"); await audio.play();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "That turn did not go through."); setState("listening"); }
  }

  async function endCall() {
    if (recorderRef.current?.state === "recording") { recorderRef.current.onstop = null; recorderRef.current.stop(); setIsRecording(false); }
    replyAudioRef.current?.pause();
    if (callId) await endAiCompanionCall(companion.id, callId).catch(() => undefined);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setState("ended"); onConversationChanged();
  }

  return <div className="ai-call-overlay" role="dialog" aria-modal="true" aria-label={`Voice call with ${companion.name}`}>
    <div className="ai-call-card">
      <button className="ai-call-close" type="button" aria-label="Close call" onClick={() => { if (callId && state !== "ended") void endCall(); onClose(); }}>×</button>
      <div className={`ai-call-avatar ai-call-avatar-${state}`}>{companion.name.slice(0, 1).toUpperCase()}<i /></div>
      <h2>{companion.name}</h2>
      <p className="ai-call-state">{state === "ready" ? "Ready for a private voice call" : state === "calling" ? "Calling…" : state === "listening" ? isRecording ? "Listening… tap when you're done" : "Connected · tap the mic to speak" : state === "thinking" ? `${companion.name} is thinking…` : state === "speaking" ? `${companion.name} is speaking…` : state === "muted" ? "Microphone muted" : state === "reconnecting" ? "Reconnecting…" : "Call ended"}</p>
      {callId ? <span className="ai-call-timer">{formatDuration(elapsed)} · {Math.ceil(remaining / 60)} min left</span> : null}
      {lastTranscript ? <p className="ai-call-transcript"><span>You said</span>{lastTranscript}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {state === "ready" ? <button className="ai-call-start" type="button" onClick={beginCall} disabled={!capabilities.calls.enabled}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.7 3.3 3.4 5 6.7 6.7l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.7 3.9.7.6 0 1 .4 1 1v3.7c0 .6-.4 1-1 1C10.6 21.5 2.5 13.4 2.5 3.5c0-.6.4-1 1-1h3.7c.6 0 1 .4 1 1 0 1.4.2 2.7.7 3.9.1.4 0 .8-.3 1.1z" /></svg><span>Call now</span></button> : state !== "ended" ? <div className="ai-call-controls">
        <button className={state === "muted" ? "ai-call-control active" : "ai-call-control"} type="button" onClick={() => setState((current) => current === "muted" ? "listening" : "muted")} aria-label="Mute microphone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-8.5 3.6L7.1 16A7 7 0 0 0 11 18.9V22h2v-3.1a7 7 0 0 0 6-6.9v-1z" /></svg><span>Mute</span></button>
        <button className={`ai-call-control ai-call-mic${isRecording ? " recording" : ""}`} type="button" onClick={isRecording ? stopTurn : startTurn} disabled={state === "thinking" || state === "muted"} aria-label={isRecording ? "Finish speaking" : "Speak"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z" /></svg><span>{isRecording ? "Done" : "Speak"}</span></button>
        <button className="ai-call-control ai-call-end" type="button" onClick={endCall} aria-label="End call"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 15.5 2 13c5.5-5.5 14.5-5.5 20 0l-2.5 2.5-3-2c-.5-.3-.7-.9-.5-1.4-2.6-.8-5.4-.8-8 0 .2.5 0 1.1-.5 1.4z" /></svg><span>End</span></button>
      </div> : <button className="secondary-button" type="button" onClick={onClose}>Back to chat</button>}
      <p className="ai-call-disclosure">{capabilities.calls.transcriptionDisclosure}</p>
    </div>
  </div>;
}
