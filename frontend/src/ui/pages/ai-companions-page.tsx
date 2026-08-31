import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveAiCompanionVisualIdentity,
  approveAiCompanionMemoryCandidate,
  completeAiCompanionVisualIdentity,
  createAiCompanion,
  createAiCompanionMemory,
  deleteAiCompanionMemory,
  dismissAiCompanionMemoryCandidate,
  fetchAiCompanion,
  fetchAiCompanionAppearances,
  fetchAiCompanionAppearancePreview,
  fetchAiCompanions,
  fetchAiCompanionPhotoPreview,
  fetchAiCompanionDeliveredPhoto,
  fetchAiCompanionVisualCandidatePreview,
  fetchAiCompanionVisualIdentityPreview,
  prepareAiCompanionVisualIdentity,
  regenerateAiCompanionVisualIdentity,
  runAiCompanionLifestyleTest,
  selectAiCompanionVisualCandidate,
  reportAiCompanionMessage,
  requestAiCompanionPhoto,
  sendAiCompanionMessage,
  type AiCompanion,
} from "../../lib/api";

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
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = companionsQuery.data?.companions[0];
    if (first && !selectedId) setSelectedId(first.id);
  }, [companionsQuery.data?.companions, selectedId]);

  const detailQuery = useQuery({
    queryKey: ["ai-companion", selectedId],
    queryFn: () => fetchAiCompanion(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const appearancesQuery = useQuery({ queryKey: ["ai-companion-appearances"], queryFn: fetchAiCompanionAppearances, retry: false });

  const createMutation = useMutation({
    mutationFn: createAiCompanion,
    onSuccess: async ({ companion }) => {
      setSelectedId(companion.id);
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
    },
  });
  const messageMutation = useMutation({
    mutationFn: async () => {
      const outgoingMessage = message;
      const startedAt = Date.now();
      setPhotoRequestError(null);
      setPendingUserMessage(outgoingMessage);
      const result = await sendAiCompanionMessage(selectedId!, outgoingMessage);
      if (result.photoRequested) {
        try { await requestAiCompanionPhoto(selectedId!, { prompt: outgoingMessage, style: "selfie", requestMessageId: result.userMessage.id }); }
        catch (error) { setPhotoRequestError(error instanceof Error ? error.message : "The photo could not be delivered."); }
      }
      const thinkingDelay = Math.min(2600, Math.max(900, result.assistantMessage.body.length * 9));
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, thinkingDelay - (Date.now() - startedAt))));
      return result;
    },
    onSuccess: async () => {
      setMessage("");
      setPendingUserMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
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

  function create(event: FormEvent) {
    event.preventDefault();
    if (!appearanceId) return;
    const appearance = appearancesQuery.data?.appearances.find((option) => option.id === appearanceId);
    if (!appearance) return;
    createMutation.mutate({ name, identity: appearance.identity, personaKey, appearanceId, backstory, avatarKey: "companion-default", traits: { warmth: 4, playfulness: 3, directness: 3, replyStyle } });
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (message.trim() && !messageMutation.isPending) messageMutation.mutate();
  }
  function saveMemory(event: FormEvent) {
    event.preventDefault();
    if (memory.trim() && !memoryMutation.isPending) memoryMutation.mutate();
  }

  const canCreate = (companionsQuery.data?.companions.length ?? 0) < (companionsQuery.data?.entitlement.companionLimit ?? 1);
  const detail = detailQuery.data;
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
    const frame = window.requestAnimationFrame(() => {
      const messages = messagesRef.current;
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detail?.conversation.id, detail?.messages.length, pendingUserMessage]);

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
            <p className="muted">Your companion is AI, not a real person. This first preview includes up to 15 replies. Photos are identity-verified before release; voice, calls, and subscriptions are not enabled yet.</p>
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
          <header><div><p className="eyebrow">AI COMPANION</p><h2>{detail.companion.name}</h2><small className="ai-relationship-stage">{relationshipStageLabel[detail.conversation.relationshipStage]}</small></div><span className="ai-trial-counter">{Math.max(0, detail.entitlement.messageLimit - detail.conversation.trialRepliesUsed)} preview replies left</span></header>
          {!detail.aiEnabled ? <div className="ai-disabled-note">This private companion preview is not available for this account yet. We are opening it gradually while we review safety and usage.</div> : null}
          {showInternalVisualIdentityControls && detail.aiEnabled && (!detail.visualIdentity || detail.visualIdentity.status === "pending_storage") ? <div className="ai-disabled-note"><button className="text-button" onClick={() => visualIdentityMutation.mutate()} disabled={visualIdentityMutation.isPending}>Generate casting options</button></div> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "casting_review" ? <div className="ai-disabled-note"><div className="ai-casting-candidate-grid">{detail.castingCandidates.filter((candidate) => candidate.status === "candidate").map((candidate) => <article className="ai-casting-candidate-card" key={candidate.id}>{castingCandidateUrls[candidate.id] ? <img src={castingCandidateUrls[candidate.id]} alt={`${detail.companion.name} casting option ${candidate.sortOrder + 1}`} /> : null}<button className="secondary-button" onClick={() => selectCastingCandidateMutation.mutate(candidate.id)}>Choose option {candidate.sortOrder + 1}</button></article>)}</div></div> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "casting_selected" ? <button className="text-button" onClick={() => completeVisualIdentityMutation.mutate()}>Build six canonical views</button> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "review" ? <div className="ai-disabled-note"><button className="text-button" onClick={() => lifestyleTestMutation.mutate()}>Run lifestyle test</button><button className="text-button" onClick={() => approveVisualIdentityMutation.mutate()}>Approve canonical identity</button></div> : null}
          <div className="ai-messages" ref={messagesRef}>{detail.messages.length === 0 && !pendingUserMessage ? <div className="ai-empty-chat"><strong>Say hello to {detail.companion.name}.</strong><span>This is a private AI conversation. You can view and delete saved memories any time.</span></div> : detail.messages.map((item) => <article className={item.role === "user" ? "ai-message ai-message-user" : "ai-message ai-message-assistant"} key={item.id}><p>{item.body}</p>{item.role === "assistant" ? <button className="text-button" onClick={() => setReportingMessageId(item.id)}>Report response</button> : null}{reportingMessageId === item.id ? <div className="ai-report"><select value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)}><option value="unsafe">Unsafe or crisis handling</option><option value="harmful">Harmful or manipulative</option><option value="sexual_content">Sexual content</option><option value="misleading">Misleading</option><option value="other">Other</option></select><button className="secondary-button" onClick={() => reportMutation.mutate(item.id)} disabled={reportMutation.isPending}>Submit report</button></div> : null}</article>)}{detail.deliveredPhotos.map((photo) => deliveredPhotoUrls[photo.id] ? <article className="ai-message ai-message-assistant ai-photo-message" key={photo.id}><img src={deliveredPhotoUrls[photo.id]} alt={`${detail.companion.name} shared companion photo`} /></article> : null)}{pendingUserMessage ? <><article className="ai-message ai-message-user"><p>{pendingUserMessage}</p></article><div className="ai-typing" aria-label={`${detail.companion.name} is thinking`}><i /><i /><i /></div></> : null}</div>
          <form className="ai-composer" onSubmit={send}><textarea value={message} maxLength={1000} placeholder={`Message ${detail.companion.name}...`} onChange={(event) => setMessage(event.target.value)} disabled={!detail.aiEnabled || messageMutation.isPending} /><button className="primary-button" disabled={!detail.aiEnabled || !message.trim() || messageMutation.isPending}>{messageMutation.isPending ? "Replying..." : "Send"}</button>{messageMutation.error ? <p className="form-error">{messageMutation.error.message}</p> : null}{photoRequestError ? <p className="form-error">Photo delivery failed: {photoRequestError}</p> : null}</form>
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
    </main>
  );
}
