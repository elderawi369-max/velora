import { useEffect, useRef, useState } from "react";
import { endAiCompanionCall, fetchAiCompanionVoiceAudio, heartbeatAiCompanionCall, sendAiCompanionCallTurn, startAiCompanionCall, type AiCompanion, type AiCompanionVoiceCapabilities } from "../../lib/api";

type CallState = "ready" | "calling" | "listening" | "thinking" | "speaking" | "reconnecting" | "ended";

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
  const [isMuted, setIsMuted] = useState(false);
  const callIdRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);
  const mutedRef = useRef(false);
  const endedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const replyUrlRef = useRef<string | null>(null);

  function stopVoiceDetection() {
    if (vadFrameRef.current !== null) cancelAnimationFrame(vadFrameRef.current);
    vadFrameRef.current = null;
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
  }

  function closeAudioContext() {
    stopVoiceDetection();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }

  function cancelCurrentRecording() {
    cancelRecordingRef.current = true;
    stopVoiceDetection();
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else cancelRecordingRef.current = false;
    setIsRecording(false);
  }

  function finishEndedCall() {
    endedRef.current = true;
    callIdRef.current = null;
    cancelCurrentRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    closeAudioContext();
    setState("ended");
  }

  useEffect(() => {
    if (!callId || state === "ended") return;
    const tick = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    const heartbeat = window.setInterval(() => {
      heartbeatAiCompanionCall(companion.id, callId).then((usage) => {
        setRemaining(usage.remainingSeconds);
        if (usage.ended) {
          finishEndedCall();
        } else {
          setState((current) => current === "reconnecting" ? "listening" : current);
        }
      }).catch(() => setState((current) => current === "ended" ? current : "reconnecting"));
    }, 10_000);
    return () => { window.clearInterval(tick); window.clearInterval(heartbeat); };
  }, [callId, companion.id, state]);

  useEffect(() => () => {
    endedRef.current = true;
    closeAudioContext();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    replyAudioRef.current?.pause();
    if (replyUrlRef.current) URL.revokeObjectURL(replyUrlRef.current);
  }, []);

  async function beginCall() {
    setState("calling");
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") {
      setState("ready");
      setError("Voice calls need microphone access in a supported browser or the Velora app.");
      return;
    }
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const result = await startAiCompanionCall(companion.id);
      callIdRef.current = result.call.id;
      endedRef.current = false;
      setCallId(result.call.id);
      setRemaining(result.call.maxSeconds);
      await startListening(result.call.id, stream);
    } catch (nextError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      closeAudioContext();
      setState("ready");
      setError(nextError instanceof Error ? nextError.message : "The call could not start.");
    }
  }

  async function startListening(activeCallId: string, providedStream?: MediaStream) {
    if (endedRef.current || mutedRef.current || recorderRef.current?.state === "recording") return;
    replyAudioRef.current?.pause();
    stopVoiceDetection();
    setError(null);
    try {
      const stream = providedStream ?? streamRef.current ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      cancelRecordingRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stopVoiceDetection();
        setIsRecording(false);
        recorderRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (cancelRecordingRef.current || endedRef.current || mutedRef.current) {
          cancelRecordingRef.current = false;
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 800) {
          setError("I couldn't hear that. Please try again.");
          window.setTimeout(() => { void startListening(activeCallId); }, 250);
          return;
        }
        void submitTurn(blob, activeCallId);
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setState("listening");

      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      audioSourceRef.current = source;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let speechStarted = false;
      let lastSpeechAt = performance.now();
      const recordingStartedAt = performance.now();

      const detectSpeech = () => {
        if (recorder.state !== "recording" || endedRef.current || mutedRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const volume = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (volume >= 0.025) {
          speechStarted = true;
          lastSpeechAt = now;
        }
        if ((speechStarted && now - lastSpeechAt >= 1050) || now - recordingStartedAt >= 60_000) {
          recorder.stop();
          setState("thinking");
          return;
        }
        vadFrameRef.current = requestAnimationFrame(detectSpeech);
      };
      if (context.state === "suspended") await context.resume();
      vadFrameRef.current = requestAnimationFrame(detectSpeech);
    } catch {
      stopVoiceDetection();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;
      setIsRecording(false);
      setError("Microphone access is needed for a companion call.");
    }
  }

  async function submitTurn(blob: Blob, activeCallId: string) {
    setState("thinking");
    try {
      const result = await sendAiCompanionCallTurn(companion.id, activeCallId, blob);
      const callEnded = result.call.ended;
      setLastTranscript(result.transcript);
      setRemaining(result.call.remainingSeconds);
      onConversationChanged();
      if (replyUrlRef.current) URL.revokeObjectURL(replyUrlRef.current);
      const url = await fetchAiCompanionVoiceAudio(companion.id, result.voiceAsset.id);
      replyUrlRef.current = url;
      const audio = new Audio(url);
      replyAudioRef.current = audio;
      audio.onended = () => {
        if (callEnded) finishEndedCall();
        else if (mutedRef.current) setState("listening");
        else void startListening(activeCallId);
      };
      audio.onerror = () => {
        setError("The reply was saved, but audio playback failed.");
        if (callEnded) finishEndedCall();
        else if (mutedRef.current) setState("listening");
        else void startListening(activeCallId);
      };
      setState("speaking");
      try {
        await audio.play();
      } catch {
        setError("The reply was saved, but audio playback could not start.");
        if (callEnded) finishEndedCall();
        else if (mutedRef.current) setState("listening");
        else void startListening(activeCallId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "That turn did not go through.");
      if (mutedRef.current) setState("listening");
      else void startListening(activeCallId);
    }
  }

  function toggleMute() {
    if (isMuted) {
      mutedRef.current = false;
      setIsMuted(false);
      const activeCallId = callIdRef.current;
      if (activeCallId && state !== "thinking" && state !== "speaking") void startListening(activeCallId);
      return;
    }
    mutedRef.current = true;
    setIsMuted(true);
    cancelCurrentRecording();
  }

  async function endCall() {
    endedRef.current = true;
    cancelCurrentRecording();
    replyAudioRef.current?.pause();
    const activeCallId = callIdRef.current;
    callIdRef.current = null;
    if (activeCallId) await endAiCompanionCall(companion.id, activeCallId).catch(() => undefined);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    closeAudioContext();
    setState("ended");
    onConversationChanged();
  }

  const status = state === "ready" ? "Ready for a private voice call"
    : state === "calling" ? "Calling…"
      : state === "listening" ? isMuted ? "Microphone muted" : isRecording ? "Listening… just speak naturally" : "Connected"
        : state === "thinking" ? `${companion.name} is thinking…`
          : state === "speaking" ? `${companion.name} is speaking…`
            : state === "reconnecting" ? "Reconnecting…"
              : "Call ended";

  return <div className="ai-call-overlay" role="dialog" aria-modal="true" aria-label={`Voice call with ${companion.name}`}>
    <div className="ai-call-card">
      <button className="ai-call-close" type="button" aria-label="Close call" onClick={() => { if (callId && state !== "ended") void endCall().finally(onClose); else onClose(); }}>×</button>
      <div className={`ai-call-avatar ai-call-avatar-${state}`}>{companion.name.slice(0, 1).toUpperCase()}<i /></div>
      <h2>{companion.name}</h2>
      <p className="ai-call-state">{status}</p>
      {callId ? <span className="ai-call-timer">{formatDuration(elapsed)} · {Math.ceil(remaining / 60)} min left</span> : null}
      {lastTranscript ? <p className="ai-call-transcript"><span>You said</span>{lastTranscript}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {state === "ready" ? <button className="ai-call-start" type="button" onClick={beginCall} disabled={!capabilities.calls.enabled}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.7 3.3 3.4 5 6.7 6.7l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.7 3.9.7.6 0 1 .4 1 1v3.7c0 .6-.4 1-1 1C10.6 21.5 2.5 13.4 2.5 3.5c0-.6.4-1 1-1h3.7c.6 0 1 .4 1 1 0 1.4.2 2.7.7 3.9.1.4 0 .8-.3 1.1z" /></svg><span>Call now</span></button> : state !== "ended" ? <div className="ai-call-controls">
        <button className={isMuted ? "ai-call-control active" : "ai-call-control"} type="button" onClick={toggleMute} aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-8.5 3.6L7.1 16A7 7 0 0 0 11 18.9V22h2v-3.1a7 7 0 0 0 6-6.9v-1z" /></svg><span>{isMuted ? "Unmute" : "Mute"}</span></button>
        <button className="ai-call-control ai-call-end" type="button" onClick={endCall} aria-label="End call"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 15.5 2 13c5.5-5.5 14.5-5.5 20 0l-2.5 2.5-3-2c-.5-.3-.7-.9-.5-1.4-2.6-.8-5.4-.8-8 0 .2.5 0 1.1-.5 1.4z" /></svg><span>End</span></button>
      </div> : <button className="secondary-button" type="button" onClick={onClose}>Back to chat</button>}
      <p className="ai-call-disclosure">{capabilities.calls.transcriptionDisclosure}</p>
    </div>
  </div>;
}
