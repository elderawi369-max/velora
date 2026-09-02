import { useEffect, useRef, useState } from "react";
import { fetchAiCompanionVoiceAudio, type AiCompanionVoiceAsset } from "../../lib/api";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function CompanionVoiceNote({ companionId, asset, transcript }: { companionId: string; asset: AiCompanionVoiceAsset; transcript: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const duration = Math.max(1, (asset.durationMs ?? 0) / 1000);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function togglePlayback() {
    setError(null);
    try {
      let nextUrl = url;
      if (!nextUrl) {
        setLoading(true);
        nextUrl = await fetchAiCompanionVoiceAudio(companionId, asset.id);
        setUrl(nextUrl);
        setLoading(false);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) { await audio.play(); setPlaying(true); }
      else { audio.pause(); setPlaying(false); }
    } catch {
      setLoading(false);
      setError("Tap to retry");
    }
  }

  return <div className="ai-voice-note">
    <button className="ai-voice-play" type="button" onClick={togglePlayback} aria-label={playing ? "Pause voice message" : "Play voice message"}>
      {loading ? <span className="ai-voice-spinner" /> : playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
    </button>
    <div className="ai-voice-body">
      <div className="ai-voice-wave" aria-hidden="true">{[8, 14, 20, 11, 25, 17, 10, 22, 28, 16, 12, 24, 18, 9, 20, 14, 26, 11].map((height, index) => <i key={index} style={{ height: `${height}px`, opacity: currentTime / duration > index / 18 ? 1 : 0.42 }} />)}</div>
      <div className="ai-voice-meta"><span>{formatTime(playing ? currentTime : duration)}</span><button type="button" onClick={() => setShowTranscript((shown) => !shown)}>{showTranscript ? "Hide text" : "Transcript"}</button></div>
    </div>
    {url ? <audio ref={audioRef} src={url} preload="metadata" onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0); }} /> : <audio ref={audioRef} />}
    {error ? <button className="ai-voice-error" type="button" onClick={togglePlayback}>{error}</button> : null}
    {showTranscript ? <p className="ai-voice-transcript">{transcript}</p> : null}
  </div>;
}
