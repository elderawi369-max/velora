import { useEffect, useRef, useState } from "react";
import { fetchAiCompanionVoiceAudio, type AiCompanionVoiceAsset } from "../../lib/api";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function CompanionVoiceNote({ companionId, asset, transcript, initialUrl, transcriptControl = true }: { companionId: string; asset: AiCompanionVoiceAsset; transcript: string; initialUrl?: string; transcriptControl?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(initialUrl ?? null);
  const ownsUrlRef = useRef(false);
  const loadPromiseRef = useRef<Promise<string> | null>(null);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const duration = Math.max(1, (asset.durationMs ?? 0) / 1000);

  async function loadAudio(showLoading: boolean) {
    if (urlRef.current) return urlRef.current;
    if (showLoading) setLoading(true);
    if (!loadPromiseRef.current) {
      loadPromiseRef.current = fetchAiCompanionVoiceAudio(companionId, asset.id).then((nextUrl) => {
        ownsUrlRef.current = true;
        urlRef.current = nextUrl;
        setUrl(nextUrl);
        return nextUrl;
      }).finally(() => {
        loadPromiseRef.current = null;
        setLoading(false);
      });
    }
    return loadPromiseRef.current;
  }

  useEffect(() => {
    const node = rootRef.current;
    if (!node || initialUrl || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadAudio(false).catch(() => undefined);
    }, { rootMargin: "220px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [asset.id, companionId, initialUrl]);

  useEffect(() => {
    if (url) audioRef.current?.load();
  }, [url]);

  useEffect(() => () => {
    if (ownsUrlRef.current && urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function togglePlayback() {
    setError(null);
    try {
      await loadAudio(true);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) { await audio.play(); setPlaying(true); }
      else { audio.pause(); setPlaying(false); }
    } catch {
      setLoading(false);
      setError("Tap play again");
    }
  }

  return <div className="ai-voice-note" ref={rootRef}>
    <button className="ai-voice-play" type="button" onClick={togglePlayback} aria-label={playing ? "Pause voice message" : "Play voice message"}>
      {loading ? <span className="ai-voice-spinner" /> : playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
    </button>
    <div className="ai-voice-body">
      <div className="ai-voice-wave" aria-hidden="true">{[8, 14, 20, 11, 25, 17, 10, 22, 28, 16, 12, 24, 18, 9, 20, 14, 26, 11].map((height, index) => <i key={index} style={{ height: `${height}px`, opacity: currentTime / duration > index / 18 ? 1 : 0.42 }} />)}</div>
      <div className="ai-voice-meta"><span>{formatTime(playing ? currentTime : duration)}</span>{transcriptControl ? <button type="button" onClick={() => setShowTranscript((shown) => !shown)}>{showTranscript ? "Hide text" : "Transcript"}</button> : <span>Audio response</span>}</div>
    </div>
    <audio ref={audioRef} src={url ?? undefined} preload="metadata" onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
    {error ? <button className="ai-voice-error" type="button" onClick={togglePlayback}>{error}</button> : null}
    {transcriptControl && showTranscript ? <p className="ai-voice-transcript">{transcript}</p> : null}
  </div>;
}
