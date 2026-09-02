import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveAiCompanionVisualIdentity,
  approveAiCompanionMemoryCandidate,
  completeAiCompanionVisualIdentity,
  createAiCompanion,
  createAiCompanionMemory,
  createAiCompanionVoiceMessage,
  deleteAiCompanionUserPhoto,
  deleteAiCompanionMemory,
  dismissAiCompanionMemoryCandidate,
  fetchAiCompanion,
  fetchAiCompanionAppearances,
  fetchAiCompanionAppearancePreview,
  fetchAiCompanions,
  fetchAiCompanionPhotoPreview,
  fetchAiCompanionDeliveredPhoto,
  fetchAiCompanionUserPhoto,
  fetchAiCompanionUserPhotoContent,
  fetchAiCompanionVoiceCapabilities,
  fetchAiCompanionVisualCandidatePreview,
  fetchAiCompanionVisualIdentityPreview,
  prepareAiCompanionVisualIdentity,
  regenerateAiCompanionVisualIdentity,
  runAiCompanionLifestyleTest,
  selectAiCompanionVisualCandidate,
  reportAiCompanionMessage,
  requestAiCompanionPhoto,
  sendAiCompanionMessage,
  transcribeAiCompanionVoiceInput,
  uploadAiCompanionUserPhoto,
  type AiCompanion,
} from "../../lib/api";
import { CompanionCallDialog } from "../components/companion-call-dialog";
import { CompanionVoiceNote } from "../components/companion-voice-note";
import "../components/companion-voice.css";

const personas = [
  { key: "supportive_partner", title: "Supportive Partner", description: "Warm, attentive, and encouraging." },
  { key: "playful_tease", title: "Playful Tease", description: "Light, affectionate, and witty." },
  { key: "sarcastic_best_friend", title: "Sarcastic Best Friend", description: "A romantic companion with funny, candid best-friend energy." },
  { key: "confident_leader", title: "Confident Leader", description: "Calm, direct, and respectful of boundaries." },
  { key: "quiet_romantic", title: "Quiet Romantic", description: "Gentle, thoughtful, and slow-building." },
  { key: "personal_growth_companion", title: "Personal Growth Companion", description: "Practical encouragement for your goals." },
] as const;

function companionInitial(companion: AiCompanion) {
  return companion.name.slice(0, 1).toUpperCase();
}

const relationshipStageLabel = { new: "Getting to know each other", familiar: "Growing closer", established: "Established connection" } as const;

async function normalizeUserPhoto(file: File) {
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("Choose a photo that is 5 MB or smaller.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("This file could not be read as a photo. Choose a JPEG, PNG, or WebP image."); }
  try {
    if (bitmap.width < 256 || bitmap.height < 256) throw new Error("Photo dimensions must be at least 256 by 256 pixels.");
    if (bitmap.width > 6000 || bitmap.height > 6000 || bitmap.width * bitmap.height > 20_000_000) throw new Error("Photo dimensions are too large. Choose an image up to 6000 pixels per side and 20 megapixels.");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d"); if (!context) throw new Error("Photo processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("The photo could not be prepared for upload.");
    return blob;
  } finally { bitmap.close(); }
}

export function AiCompanionsPage() {
  const queryClient = useQueryClient();
  const companionsQuery = useQuery({ queryKey: ["ai-companions"], queryFn: fetchAiCompanions, retry: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [personaKey, setPersonaKey] = useState<(typeof personas)[number]["key"]>("supportive_partner");
  const [appearanceId, setAppearanceId] = useState<string | null>(null);
  const [appearanceUrls, setAppearanceUrls] = useState<Record<string, string>>({});
  const [replyStyle, setReplyStyle] = useState<"short" | "natural" | "detailed">("natural");
  const [backstory, setBackstory] = useState("");
  const [message, setMessage] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [photoRequestError, setPhotoRequestError] = useState<string | null>(null);
  const [memory, setMemory] = useState("");
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<"unsafe" | "harmful" | "sexual_content" | "misleading" | "other">("unsafe");
  const [visualReferenceUrls, setVisualReferenceUrls] = useState<string[]>([]);
  const [castingCandidateUrls, setCastingCandidateUrls] = useState<Record<string, string>>({});
  const [lifestyleTestUrls, setLifestyleTestUrls] = useState<string[]>([]);
  const [deliveredPhotoUrls, setDeliveredPhotoUrls] = useState<Record<string, string>>({});
  const [selectedUserPhoto, setSelectedUserPhoto] = useState<Blob | null>(null);
  const [selectedUserPhotoUrl, setSelectedUserPhotoUrl] = useState<string | null>(null);
  const [userPhotoUrls, setUserPhotoUrls] = useState<Record<string, string>>({});
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [userPhotoProgress, setUserPhotoProgress] = useState(0);
  const [userPhotoError, setUserPhotoError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const first = companionsQuery.data?.companions[0];
    if (first && !selectedId) setSelectedId(first.id);
  }, [companionsQuery.data?.companions, selectedId]);

  useEffect(() => () => {
    if (voiceRecorderRef.current?.state === "recording") { voiceRecorderRef.current.onstop = null; voiceRecorderRef.current.stop(); }
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const detailQuery = useQuery({
    queryKey: ["ai-companion", selectedId],
    queryFn: () => fetchAiCompanion(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const appearancesQuery = useQuery({ queryKey: ["ai-companion-appearances"], queryFn: fetchAiCompanionAppearances, retry: false });
  const userPhotoQuery = useQuery({ queryKey: ["ai-companion-user-photo", selectedId], queryFn: () => fetchAiCompanionUserPhoto(selectedId!), enabled: Boolean(selectedId), retry: false });
  const voiceQuery = useQuery({ queryKey: ["ai-companion-voice", selectedId], queryFn: () => fetchAiCompanionVoiceCapabilities(selectedId!), enabled: Boolean(selectedId), retry: false });

  const createMutation = useMutation({
    mutationFn: createAiCompanion,
    onSuccess: async ({ companion }) => {
      setSelectedId(companion.id);
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
    },
  });
  const messageMutation = useMutation({
    mutationFn: async ({ outgoingMessage, requestVoice }: { outgoingMessage: string; requestVoice: boolean }) => {
      const startedAt = Date.now();
      setPhotoRequestError(null);
      setVoiceError(null);
      setPendingUserMessage(outgoingMessage);
      const result = await sendAiCompanionMessage(selectedId!, outgoingMessage);
      if (result.photoRequested) {
        try { await requestAiCompanionPhoto(selectedId!, { prompt: outgoingMessage, style: "selfie", requestMessageId: result.userMessage.id }); }
        catch (error) { setPhotoRequestError(error instanceof Error ? error.message : "The photo could not be delivered."); }
      }
      if (requestVoice && result.assistantMessage.moderationStatus === "allowed") {
        try { await createAiCompanionVoiceMessage(selectedId!, result.assistantMessage.id); }
        catch (error) { setVoiceError(error instanceof Error ? error.message : "The voice note could not be created."); }
      }
      const thinkingDelay = requestVoice ? 0 : Math.min(2600, Math.max(900, result.assistantMessage.body.length * 9));
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, thinkingDelay - (Date.now() - startedAt))));
      return result;
    },
    onSuccess: async () => {
      setMessage("");
      setPendingUserMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion-voice", selectedId] });
    },
    onError: () => setPendingUserMessage(null),
  });
  const memoryMutation = useMutation({
    mutationFn: () => createAiCompanionMemory(selectedId!, memory),
    onSuccess: async () => {
      setMemory("");
      await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
    },
  });
  const deleteMemoryMutation = useMutation({
    mutationFn: (memoryId: string) => deleteAiCompanionMemory(selectedId!, memoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const approveMemoryCandidateMutation = useMutation({
    mutationFn: (candidateId: string) => approveAiCompanionMemoryCandidate(selectedId!, candidateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const dismissMemoryCandidateMutation = useMutation({
    mutationFn: (candidateId: string) => dismissAiCompanionMemoryCandidate(selectedId!, candidateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const reportMutation = useMutation({
    mutationFn: (messageId: string) => reportAiCompanionMessage(messageId, { reason: reportReason }),
    onSuccess: () => setReportingMessageId(null),
  });
  const visualIdentityMutation = useMutation({
    mutationFn: () => prepareAiCompanionVisualIdentity(selectedId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const regenerateVisualIdentityMutation = useMutation({
    mutationFn: () => regenerateAiCompanionVisualIdentity(selectedId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const completeVisualIdentityMutation = useMutation({
    mutationFn: () => completeAiCompanionVisualIdentity(selectedId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const selectCastingCandidateMutation = useMutation({
    mutationFn: (candidateId: string) => selectAiCompanionVisualCandidate(selectedId!, candidateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const lifestyleTestMutation = useMutation({
    mutationFn: () => runAiCompanionLifestyleTest(selectedId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const approveVisualIdentityMutation = useMutation({
    mutationFn: () => approveAiCompanionVisualIdentity(selectedId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }),
  });
  const userPhotoUploadMutation = useMutation({
    mutationFn: () => uploadAiCompanionUserPhoto(selectedId!, selectedUserPhoto!, setUserPhotoProgress),
    onSuccess: async () => {
      setSelectedUserPhoto(null); setSelectedUserPhotoUrl(null); setUserPhotoProgress(0); setUserPhotoError(null);
      setPhotoMenuOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion-user-photo", selectedId] });
    },
    onError: (error) => setUserPhotoError(error instanceof Error ? error.message : "The photo could not be uploaded."),
  });
  const userPhotoDeleteMutation = useMutation({
    mutationFn: (photoId: string) => deleteAiCompanionUserPhoto(selectedId!, photoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion-user-photo", selectedId] });
    },
  });

  function create(event: FormEvent) {
    event.preventDefault();
    if (!appearanceId) return;
    const appearance = appearancesQuery.data?.appearances.find((option) => option.id === appearanceId);
    if (!appearance) return;
    createMutation.mutate({ name, identity: appearance.identity, personaKey, appearanceId, backstory, avatarKey: "companion-default", traits: { warmth: 4, playfulness: 3, directness: 3, replyStyle } });
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (message.trim() && !messageMutation.isPending) messageMutation.mutate({ outgoingMessage: message, requestVoice: /\b(?:send|leave|record)\b[\s\S]{0,30}\bvoice (?:message|note)\b/i.test(message) });
  }
  async function toggleVoiceRecording() {
    const activeRecorder = voiceRecorderRef.current;
    if (activeRecorder?.state === "recording") {
      activeRecorder.stop();
      setVoiceRecording(false);
      return;
    }
    setVoiceError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setVoiceError("Voice recording needs microphone access in a supported browser or the Velora app."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) voiceChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        setVoiceTranscribing(true);
        try {
          const audio = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const transcript = await transcribeAiCompanionVoiceInput(selectedId!, audio);
          messageMutation.mutate({ outgoingMessage: transcript, requestVoice: true });
        } catch (error) { setVoiceError(error instanceof Error ? error.message : "The voice message could not be sent."); }
        finally { setVoiceTranscribing(false); }
      };
      voiceRecorderRef.current = recorder;
      recorder.start();
      setVoiceRecording(true);
    } catch { setVoiceError("Microphone access is needed to record a voice message."); }
  }
  function saveMemory(event: FormEvent) {
    event.preventDefault();
    if (memory.trim() && !memoryMutation.isPending) memoryMutation.mutate();
  }
  async function chooseUserPhoto(file: File | undefined) {
    if (!file) return;
    setUserPhotoError(null); setUserPhotoProgress(0);
    try {
      const normalized = await normalizeUserPhoto(file);
      const url = URL.createObjectURL(normalized);
      if (selectedUserPhotoUrl) URL.revokeObjectURL(selectedUserPhotoUrl);
      setSelectedUserPhoto(normalized); setSelectedUserPhotoUrl(url);
      setPhotoMenuOpen(false);
    } catch (error) { setSelectedUserPhoto(null); setUserPhotoError(error instanceof Error ? error.message : "Choose a valid photo."); }
  }

  const canCreate = (companionsQuery.data?.companions.length ?? 0) < (companionsQuery.data?.entitlement.companionLimit ?? 1);
  const detail = detailQuery.data;
  const chatTimeline = detail ? [
    ...detail.messages.map((item) => ({ kind: "message" as const, createdAt: item.createdAt, item })),
    ...detail.deliveredPhotos.map((photo) => ({ kind: "companion-photo" as const, createdAt: photo.createdAt, photo })),
  ].sort((left, right) => left.createdAt - right.createdAt) : [];
  // Casting and visual-identity review are an internal development workflow.
  // Public companion conversations must never expose these controls or states.
  const showInternalVisualIdentityControls = false;

  const appearanceIds = appearancesQuery.data?.appearances.map((appearance) => appearance.id).join(",") ?? "";
  useEffect(() => {
    if (!appearanceIds) { setAppearanceUrls({}); return; }
    let cancelled = false;
    const urls: string[] = [];
    Promise.all(appearanceIds.split(",").map(async (id) => [id, await fetchAiCompanionAppearancePreview(id)] as const)).then((entries) => {
      if (cancelled) { entries.forEach(([, url]) => URL.revokeObjectURL(url)); return; }
      entries.forEach(([, url]) => urls.push(url)); setAppearanceUrls(Object.fromEntries(entries));
    }).catch(() => { if (!cancelled) setAppearanceUrls({}); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [appearanceIds]);

  useEffect(() => {
    if (!detail) return;
    const scrollToLatest = () => {
      const messages = messagesRef.current;
      if (messages) messages.scrollTop = messages.scrollHeight;
    };
    const frame = window.requestAnimationFrame(scrollToLatest);
    const timer = window.setTimeout(scrollToLatest, 80);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [detail?.conversation.id, detail?.messages.length, detail?.deliveredPhotos.length, Object.keys(userPhotoUrls).length, Object.keys(deliveredPhotoUrls).length, pendingUserMessage]);

  useEffect(() => {
    const status = detail?.visualIdentity?.status;
    if (!selectedId || (status !== "casting_selected" && status !== "review")) { setVisualReferenceUrls([]); return; }
    let cancelled = false;
    const urls: string[] = [];
    const views = status === "casting_selected" ? ["0"] : ["0", "1", "2", "3", "4", "5"];
    Promise.all(views.map((view) => fetchAiCompanionVisualIdentityPreview(selectedId, view))).then((nextUrls) => {
      if (cancelled) { nextUrls.forEach((url) => URL.revokeObjectURL(url)); return; }
      urls.push(...nextUrls); setVisualReferenceUrls(nextUrls);
    }).catch(() => { if (!cancelled) setVisualReferenceUrls([]); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [detail?.visualIdentity?.status, selectedId]);

  const castingCandidateIds = detail?.castingCandidates.filter((candidate) => candidate.status === "candidate").map((candidate) => candidate.id).join(",") ?? "";
  useEffect(() => {
    if (!selectedId || !castingCandidateIds) { setCastingCandidateUrls({}); return; }
    const candidateIds = castingCandidateIds.split(",");
    let cancelled = false;
    const urls: string[] = [];
    Promise.all(candidateIds.map(async (candidateId) => [candidateId, await fetchAiCompanionVisualCandidatePreview(selectedId, candidateId)] as const)).then((entries) => {
      if (cancelled) { entries.forEach(([, url]) => URL.revokeObjectURL(url)); return; }
      entries.forEach(([, url]) => urls.push(url));
      setCastingCandidateUrls(Object.fromEntries(entries));
    }).catch(() => { if (!cancelled) setCastingCandidateUrls({}); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [castingCandidateIds, selectedId]);

  const lifestyleTestPhotoIds = detail?.photos.map((photo) => photo.id).join(",") ?? "";
  useEffect(() => {
    if (!selectedId || !detail?.photos.length) { setLifestyleTestUrls([]); return; }
    let cancelled = false;
    const urls: string[] = [];
    Promise.all(detail.photos.slice().reverse().map((photo) => fetchAiCompanionPhotoPreview(selectedId, photo.id))).then((nextUrls) => {
      if (cancelled) { nextUrls.forEach((url) => URL.revokeObjectURL(url)); return; }
      urls.push(...nextUrls); setLifestyleTestUrls(nextUrls);
    }).catch(() => { if (!cancelled) setLifestyleTestUrls([]); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [lifestyleTestPhotoIds, selectedId]);

  const deliveredPhotoIds = detail?.deliveredPhotos.map((photo) => photo.id).join(",") ?? "";
  useEffect(() => {
    if (!selectedId || !deliveredPhotoIds) { setDeliveredPhotoUrls({}); return; }
    let cancelled = false;
    const urls: string[] = [];
    Promise.all(deliveredPhotoIds.split(",").map(async (photoId) => [photoId, await fetchAiCompanionDeliveredPhoto(selectedId, photoId)] as const)).then((entries) => {
      if (cancelled) { entries.forEach(([, url]) => URL.revokeObjectURL(url)); return; }
      entries.forEach(([, url]) => urls.push(url));
      setDeliveredPhotoUrls(Object.fromEntries(entries));
    }).catch(() => { if (!cancelled) setDeliveredPhotoUrls({}); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [deliveredPhotoIds, selectedId]);

  useEffect(() => {
    setSelectedUserPhoto(null); setSelectedUserPhotoUrl(null); setUserPhotoError(null); setUserPhotoProgress(0); setPhotoMenuOpen(false);
  }, [selectedId]);
  const userPhotoIds = detail?.userPhotos.map((photo) => photo.id).join(",") ?? "";
  useEffect(() => {
    if (!selectedId || !detail?.userPhotos.length) { setUserPhotoUrls({}); return; }
    let cancelled = false;
    const urls: string[] = [];
    Promise.all(detail.userPhotos.map(async (photo) => [photo.id, await fetchAiCompanionUserPhotoContent(selectedId, photo.id)] as const)).then((entries) => {
      if (cancelled) { entries.forEach(([, url]) => URL.revokeObjectURL(url)); return; }
      entries.forEach(([, url]) => urls.push(url));
      setUserPhotoUrls(Object.fromEntries(entries));
    }).catch(() => { if (!cancelled) setUserPhotoUrls({}); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [userPhotoIds, selectedId]);

  const userPhotoByMessageId = new Map((detail?.userPhotos ?? []).map((photo) => [photo.messageId, photo]));
  const voiceByMessageId = new Map((detail?.voiceAssets ?? []).filter((asset) => asset.messageId).map((asset) => [asset.messageId!, asset]));

  return (
    <main className="page-shell ai-companions-page">
      <section className="ai-hero">
        <p className="eyebrow">PRIVATE AI COMPANIONS</p>
        <h1>A conversation that gets to know you.</h1>
        <p>Build one adult virtual companion for private, clearly AI-labelled conversations. You stay in control of what is remembered.</p>
      </section>

      {companionsQuery.isLoading ? <p className="status-message">Loading your companion space...</p> : null}
      {companionsQuery.error ? <p className="form-error">{companionsQuery.error.message}</p> : null}
      {selectedId && detailQuery.isLoading ? <p className="status-message">Loading your companion...</p> : null}
      {selectedId && detailQuery.error ? <p className="form-error">Unable to load your companion: {detailQuery.error.message}</p> : null}

      {selectedId && !detail && companionsQuery.data?.companions.length ? (
        <section className="ai-companion-workspace">
          <aside className="ai-sidebar">
            <p className="eyebrow">YOUR COMPANION</p>
            {companionsQuery.data.companions.map((companion) => <button className={companion.id === selectedId ? "ai-companion-chip ai-companion-chip-selected" : "ai-companion-chip"} key={companion.id} onClick={() => setSelectedId(companion.id)}><span className="ai-avatar">{companionInitial(companion)}</span><span><strong>{companion.name}</strong><small>AI companion</small></span></button>)}
          </aside>
        </section>
      ) : null}

      {canCreate ? (
        <section className="ai-create-card">
          <div>
            <p className="eyebrow">CREATE YOUR COMPANION</p>
            <h2>Start with a personality, then make it yours.</h2>
            <p className="muted">Your companion is AI, not a real person. This first preview includes up to 15 replies. Photos are identity-verified, and eligible plans can use private voice notes and turn-based calls.</p>
          </div>
          <form className="ai-create-form" onSubmit={create}>
            <fieldset className="ai-persona-fieldset"><legend>Personality</legend><div className="ai-persona-grid">{personas.map((persona) => <button type="button" key={persona.key} className={personaKey === persona.key ? "ai-persona ai-persona-selected" : "ai-persona"} onClick={() => setPersonaKey(persona.key)}><strong>{persona.title}</strong><span>{persona.description}</span></button>)}</div></fieldset>
            <fieldset className="ai-persona-fieldset"><legend>Appearance</legend><p className="muted">Choose one approved fictional adult appearance. This identity stays fixed regardless of personality or the private name you choose.</p><div className="ai-appearance-grid">{appearancesQuery.data?.appearances.map((appearance) => <button type="button" key={appearance.id} className={appearanceId === appearance.id ? "ai-appearance ai-appearance-selected" : "ai-appearance"} onClick={() => setAppearanceId(appearance.id)}>{appearanceUrls[appearance.id] ? <img src={appearanceUrls[appearance.id]} alt={`${appearance.name} appearance option`} /> : <span className="ai-appearance-loading">Loading appearance...</span>}<strong>{appearance.name}</strong></button>)}</div>{appearancesQuery.error ? <p className="form-error">Unable to load appearance options.</p> : null}</fieldset>
            <label>Private name<input value={name} maxLength={30} placeholder="What would you like to call them?" onChange={(event) => setName(event.target.value)} /><span className="muted">This is only your label for the companion; it never changes their appearance.</span></label>
            <label>Reply style<select value={replyStyle} onChange={(event) => setReplyStyle(event.target.value as typeof replyStyle)}><option value="short">Short &amp; texty</option><option value="natural">Natural</option><option value="detailed">Detailed</option></select></label>
            <label>Short backstory <span className="muted">optional</span><textarea value={backstory} maxLength={500} placeholder="A few details that make this companion feel distinct..." onChange={(event) => setBackstory(event.target.value)} /></label>
            {createMutation.error ? <p className="form-error">{createMutation.error.message}</p> : null}
            <button className="primary-button" disabled={createMutation.isPending || !appearanceId || name.trim().length < 2}>{createMutation.isPending ? "Creating..." : "Create companion"}</button>
          </form>
        </section>
      ) : null}

      {detail ? <section className="ai-companion-workspace">
        <aside className="ai-sidebar">
          <p className="eyebrow">YOUR COMPANION</p>
          {companionsQuery.data?.companions.map((companion) => <button className={companion.id === selectedId ? "ai-companion-chip ai-companion-chip-selected" : "ai-companion-chip"} key={companion.id} onClick={() => setSelectedId(companion.id)}><span className="ai-avatar">{companionInitial(companion)}</span><span><strong>{companion.name}</strong><small>AI companion</small></span></button>)}
          <div className="ai-safety-note"><strong>Always AI.</strong><span>Private chats are not a substitute for real-world emergency or professional support.</span></div>
        </aside>
        <div className="ai-chat-card">
          <header><div><p className="eyebrow">AI COMPANION</p><h2>{detail.companion.name}</h2><small className="ai-relationship-stage">{relationshipStageLabel[detail.conversation.relationshipStage]}</small></div><div className="ai-chat-actions"><button className="ai-call-button" type="button" aria-label={`Call ${detail.companion.name}`} title={voiceQuery.data?.calls.enabled ? `Call ${detail.companion.name}` : "Voice calls require Velora Ultra"} onClick={() => setCallOpen(true)} disabled={!voiceQuery.data?.calls.enabled}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.7 3.3 3.4 5 6.7 6.7l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.7 3.9.7.6 0 1 .4 1 1v3.7c0 .6-.4 1-1 1C10.6 21.5 2.5 13.4 2.5 3.5c0-.6.4-1 1-1h3.7c.6 0 1 .4 1 1 0 1.4.2 2.7.7 3.9.1.4 0 .8-.3 1.1z" /></svg></button><span className="ai-trial-counter">{Math.max(0, detail.entitlement.messageLimit - detail.conversation.trialRepliesUsed)} preview replies left</span></div></header>
          {!detail.aiEnabled ? <div className="ai-disabled-note">This private companion preview is not available for this account yet. We are opening it gradually while we review safety and usage.</div> : null}
          {showInternalVisualIdentityControls && detail.aiEnabled && (!detail.visualIdentity || detail.visualIdentity.status === "pending_storage") ? <div className="ai-disabled-note"><button className="text-button" onClick={() => visualIdentityMutation.mutate()} disabled={visualIdentityMutation.isPending}>Generate casting options</button></div> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "casting_review" ? <div className="ai-disabled-note"><div className="ai-casting-candidate-grid">{detail.castingCandidates.filter((candidate) => candidate.status === "candidate").map((candidate) => <article className="ai-casting-candidate-card" key={candidate.id}>{castingCandidateUrls[candidate.id] ? <img src={castingCandidateUrls[candidate.id]} alt={`${detail.companion.name} casting option ${candidate.sortOrder + 1}`} /> : null}<button className="secondary-button" onClick={() => selectCastingCandidateMutation.mutate(candidate.id)}>Choose option {candidate.sortOrder + 1}</button></article>)}</div></div> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "casting_selected" ? <button className="text-button" onClick={() => completeVisualIdentityMutation.mutate()}>Build six canonical views</button> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "review" ? <div className="ai-disabled-note"><button className="text-button" onClick={() => lifestyleTestMutation.mutate()}>Run lifestyle test</button><button className="text-button" onClick={() => approveVisualIdentityMutation.mutate()}>Approve canonical identity</button></div> : null}
          <div className="ai-messages" ref={messagesRef}>
            {chatTimeline.length === 0 && !pendingUserMessage ? <div className="ai-empty-chat"><strong>Say hello to {detail.companion.name}.</strong><span>This is a private AI conversation. You can view and delete saved memories any time.</span></div> : chatTimeline.map((entry) => {
              if (entry.kind === "companion-photo") return deliveredPhotoUrls[entry.photo.id] ? <article className="ai-message ai-message-assistant ai-photo-message" key={`companion-photo-${entry.photo.id}`}><img src={deliveredPhotoUrls[entry.photo.id]} alt={`${detail.companion.name} shared companion photo`} /></article> : null;
              const item = entry.item;
              const attachedPhoto = userPhotoByMessageId.get(item.id);
              const voiceAsset = voiceByMessageId.get(item.id);
              return <article className={`${item.role === "user" ? "ai-message ai-message-user" : "ai-message ai-message-assistant"}${attachedPhoto ? " ai-photo-message" : ""}`} key={item.id}>
                {attachedPhoto && userPhotoUrls[attachedPhoto.id] ? <><img src={userPhotoUrls[attachedPhoto.id]} alt="Photo you sent to your AI companion" /><button className="ai-photo-remove" type="button" onClick={() => userPhotoDeleteMutation.mutate(attachedPhoto.id)} disabled={userPhotoDeleteMutation.isPending}>Remove</button></> : voiceAsset && item.role === "assistant" ? <CompanionVoiceNote companionId={detail.companion.id} asset={voiceAsset} transcript={item.body} /> : <p>{item.body}</p>}
                {item.role === "assistant" ? <button className="text-button" onClick={() => setReportingMessageId(item.id)}>Report response</button> : null}
                {reportingMessageId === item.id ? <div className="ai-report"><select value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)}><option value="unsafe">Unsafe or crisis handling</option><option value="harmful">Harmful or manipulative</option><option value="sexual_content">Sexual content</option><option value="misleading">Misleading</option><option value="other">Other</option></select><button className="secondary-button" onClick={() => reportMutation.mutate(item.id)} disabled={reportMutation.isPending}>Submit report</button></div> : null}
              </article>;
            })}
            {pendingUserMessage ? <><article className="ai-message ai-message-user"><p>{pendingUserMessage}</p></article><div className="ai-typing" aria-label={`${detail.companion.name} is thinking`}><i /><i /><i /></div></> : null}
          </div>
          <form className="ai-composer" onSubmit={send}>
            <div className="ai-attachment-control">
              <button className="ai-attachment-button" type="button" aria-label="Attach a photo" aria-expanded={photoMenuOpen} onClick={() => setPhotoMenuOpen((open) => !open)} disabled={!detail.aiEnabled || userPhotoUploadMutation.isPending}>+</button>
              {photoMenuOpen ? <div className="ai-attachment-menu"><label className="ai-photo-picker">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseUserPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><label className="ai-photo-picker">Take selfie<input type="file" accept="image/*" capture="user" onChange={(event) => { void chooseUserPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div> : null}
            </div>
            <textarea value={message} maxLength={1000} placeholder={voiceRecording ? "Recording… tap stop when you're finished" : voiceTranscribing ? "Preparing your voice message…" : `Message ${detail.companion.name}...`} onChange={(event) => setMessage(event.target.value)} disabled={!detail.aiEnabled || messageMutation.isPending || voiceRecording || voiceTranscribing} />
            {message.trim() ? <button className="ai-send-button" type="submit" aria-label="Send message" disabled={!detail.aiEnabled || messageMutation.isPending}>{messageMutation.isPending ? <span className="ai-voice-spinner" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 20 18-8L3 4v6l13 2-13 2z" /></svg>}</button> : <button className={`ai-mic-button${voiceRecording ? " recording" : ""}`} type="button" aria-label={voiceRecording ? "Finish voice message" : `Record a voice message for ${detail.companion.name}`} title={voiceRecording ? "Tap to finish" : "Record a voice message"} onClick={toggleVoiceRecording} disabled={!detail.aiEnabled || !voiceQuery.data?.voice.enabled || messageMutation.isPending || voiceTranscribing}>{voiceTranscribing ? <span className="ai-voice-spinner" /> : voiceRecording ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z" /></svg>}</button>}
            {selectedUserPhotoUrl ? <div className="ai-attachment-preview"><img src={selectedUserPhotoUrl} alt="Photo ready to send" /><div><strong>Ready to send privately</strong><small>It will appear in chat only after safety review.</small><span><button className="primary-button" type="button" onClick={() => userPhotoUploadMutation.mutate()} disabled={userPhotoUploadMutation.isPending}>{userPhotoUploadMutation.isPending ? userPhotoProgress >= 100 ? "Reviewing..." : `Uploading ${userPhotoProgress}%` : "Send photo"}</button><button className="text-button" type="button" onClick={() => { URL.revokeObjectURL(selectedUserPhotoUrl); setSelectedUserPhoto(null); setSelectedUserPhotoUrl(null); setUserPhotoProgress(0); setUserPhotoError(null); }} disabled={userPhotoUploadMutation.isPending}>Cancel</button></span></div></div> : null}
            {userPhotoUploadMutation.isPending ? <progress max="100" value={userPhotoProgress} aria-label="Photo upload progress" /> : null}
            {userPhotoQuery.data?.quota ? <small className="ai-photo-quota">{userPhotoQuery.data.quota.monthlyLimit > 0 ? `${userPhotoQuery.data.quota.remaining} of ${userPhotoQuery.data.quota.monthlyLimit} photo sends left this month` : "Photo sending is available with Velora Pro or Ultra"}</small> : null}
            {userPhotoError ? <p className="form-error">{userPhotoError}</p> : null}
            {userPhotoDeleteMutation.error ? <p className="form-error">{userPhotoDeleteMutation.error.message}</p> : null}
            {messageMutation.error ? <p className="form-error">{messageMutation.error.message}</p> : null}{photoRequestError ? <p className="form-error">Photo delivery failed: {photoRequestError}</p> : null}
            {voiceError ? <p className="form-error">Voice note: {voiceError}</p> : null}
            {voiceQuery.data?.voice.enabled ? <small className="ai-voice-quota">{Math.max(0, voiceQuery.data.voice.dailyLimit - voiceQuery.data.voice.dailyUsed)} voice notes left today · {Math.max(0, voiceQuery.data.voice.monthlyLimit - voiceQuery.data.voice.monthlyUsed)} this month</small> : null}
          </form>
        </div>
        <aside className="ai-memory-card">
          <p className="eyebrow">JOURNAL OF US</p>
          <h2>What {detail.companion.name} remembers</h2>
          <p className="muted">You control every long-term memory. Review suggestions before they are saved.</p>
          {detail.memoryCandidates.length > 0 ? <section className="ai-memory-candidates"><strong>Suggested memories</strong>{detail.memoryCandidates.map((candidate) => <div key={candidate.id}><span>{candidate.content}</span><div><button className="secondary-button" onClick={() => approveMemoryCandidateMutation.mutate(candidate.id)} disabled={approveMemoryCandidateMutation.isPending || dismissMemoryCandidateMutation.isPending}>Keep</button><button className="text-button" onClick={() => dismissMemoryCandidateMutation.mutate(candidate.id)} disabled={approveMemoryCandidateMutation.isPending || dismissMemoryCandidateMutation.isPending}>Dismiss</button></div></div>)}</section> : null}
          <form onSubmit={saveMemory}><textarea value={memory} maxLength={280} placeholder="Example: I start a new job on Monday." onChange={(event) => setMemory(event.target.value)} /><button className="secondary-button" disabled={memoryMutation.isPending || !memory.trim()}>Save memory</button></form>
          <div className="ai-memory-list">{detail.memories.map((item) => <div key={item.id}><span>{item.content}</span><button className="text-button" onClick={() => deleteMemoryMutation.mutate(item.id)}>Delete</button></div>)}{detail.memories.length === 0 ? <p className="muted">Nothing has been saved yet.</p> : null}</div>
        </aside>
      </section> : null}
      {detail && callOpen && voiceQuery.data ? <CompanionCallDialog companion={detail.companion} capabilities={voiceQuery.data} onClose={() => setCallOpen(false)} onConversationChanged={() => { void queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }); void queryClient.invalidateQueries({ queryKey: ["ai-companion-voice", selectedId] }); }} /> : null}
    </main>
  );
}
