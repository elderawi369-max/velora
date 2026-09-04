import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  approveAiCompanionVisualIdentity,
  approveAiCompanionMemoryCandidate,
  completeAiCompanionVisualIdentity,
  createAiCompanion,
  createAiCompanionSubscriptionCheckout,
  createAiCompanionMemory,
  createAiCompanionVoiceMessage,
  deleteAiCompanionVoiceInput,
  deleteAiCompanionUserPhoto,
  deleteAiCompanionMemory,
  dismissAiCompanionMemoryCandidate,
  fetchAiCompanion,
  fetchAiCompanionAppearances,
  fetchAiCompanionPlans,
  getAiCompanionAppearancePreviewUrl,
  fetchAiCompanions,
  fetchAiCompanionPhotoPreview,
  fetchAiCompanionDeliveredPhoto,
  fetchAiCompanionUserPhoto,
  fetchAiCompanionUserPhotoContent,
  fetchAiCompanionVoiceCapabilities,
  fetchSession,
  fetchAiCompanionVisualCandidatePreview,
  fetchAiCompanionVisualIdentityPreview,
  completeAiCompanionSubscriptionCheckout,
  prepareAiCompanionVisualIdentity,
  regenerateAiCompanionVisualIdentity,
  refreshAiCompanionSubscription,
  runAiCompanionLifestyleTest,
  selectAiCompanionVisualCandidate,
  reportAiCompanionMessage,
  reportAiCompanionPhoto,
  requestAiCompanionPhoto,
  sendAiCompanionMessage,
  transcribeAiCompanionVoiceInput,
  uploadAiCompanionUserPhoto,
  type AiCompanion,
  type AiCompanionCallLog,
  type AiCompanionVoiceAsset,
} from "../../lib/api";
import { completeGooglePlaySubscription, fetchGooglePlaySubscriptionProducts, isNativeAndroidApp, recoverGooglePlayPurchases, type GooglePlayProduct } from "../../lib/google-play-billing";
import { CompanionCallDialog } from "../components/companion-call-dialog";
import { CompanionCallDetails } from "../components/companion-call-details";
import { CompanionVoiceNote } from "../components/companion-voice-note";
import { AuthForm } from "../components/auth-form";
import { AiCompanionPaywall } from "../components/ai-companion-paywall";
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

function compactCallDuration(call: AiCompanionCallLog) {
  if (call.durationSeconds < 60) return "< 1 min";
  return `${Math.max(1, Math.round(call.durationSeconds / 60))} min`;
}

function formatRemainingVoiceTime(limitSeconds: number, usedSeconds: number) {
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);
  if (remainingSeconds <= 0) return "Shared voice allowance used for this month";
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  if (hours > 0) return `${hours} hr${minutes > 0 ? ` ${minutes} min` : ""} shared voice time left this month`;
  return `${Math.max(1, minutes)} min shared voice time left this month`;
}

function voiceAvailabilityText(voice: { enabled: boolean; monthlyLimit: number; monthlyUsed: number; freeTrialAvailable: boolean; freeTrialUsed: boolean }) {
  if (voice.freeTrialAvailable) return "1 free voice message · up to 1 minute";
  if (voice.freeTrialUsed) return "Free voice message used · Pro or Ultra includes more";
  if (!voice.enabled) return "Voice messages are available with Velora Pro or Ultra";
  return formatRemainingVoiceTime(voice.monthlyLimit, voice.monthlyUsed);
}

function scrollChatToLatest(messages: HTMLDivElement) {
  if (window.matchMedia("(max-width: 680px)").matches) {
    messages.lastElementChild?.scrollIntoView({ block: "end", behavior: "auto" });
    return;
  }
  messages.scrollTop = messages.scrollHeight;
}

const relationshipStageLabel = { new: "Getting to know each other", familiar: "Growing closer", established: "Established connection" } as const;

type CompanionPanel = "memories" | "profile" | "photos" | "settings";
const subscriptionCheckoutStorageKey = "velora-ai-subscription-checkout";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: fetchSession, retry: false });
  const companionsQuery = useQuery({ queryKey: ["ai-companions"], queryFn: fetchAiCompanions, enabled: Boolean(sessionQuery.data?.authenticated), retry: false });
  const plansQuery = useQuery({ queryKey: ["ai-companion-plans"], queryFn: fetchAiCompanionPlans, retry: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [personaKey, setPersonaKey] = useState<(typeof personas)[number]["key"]>("supportive_partner");
  const [appearanceId, setAppearanceId] = useState<string | null>(null);
  const [replyStyle, setReplyStyle] = useState<"short" | "natural" | "detailed">("natural");
  const [backstory, setBackstory] = useState("");
  const [message, setMessage] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [photoRequestError, setPhotoRequestError] = useState<string | null>(null);
  const [memory, setMemory] = useState("");
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportedPhotoIds, setReportedPhotoIds] = useState<Set<string>>(() => new Set());
  const [reportReason, setReportReason] = useState<"unsafe" | "harmful" | "sexual_content" | "misleading" | "other">("unsafe");
  const [visualReferenceUrls, setVisualReferenceUrls] = useState<string[]>([]);
  const [castingCandidateUrls, setCastingCandidateUrls] = useState<Record<string, string>>({});
  const [lifestyleTestUrls, setLifestyleTestUrls] = useState<string[]>([]);
  const [deliveredPhotoUrls, setDeliveredPhotoUrls] = useState<Record<string, string>>({});
  const [deliveredPhotoErrors, setDeliveredPhotoErrors] = useState<Set<string>>(() => new Set());
  const [deliveredPhotoLoadRevision, setDeliveredPhotoLoadRevision] = useState(0);
  const [selectedUserPhoto, setSelectedUserPhoto] = useState<Blob | null>(null);
  const [selectedUserPhotoUrl, setSelectedUserPhotoUrl] = useState<string | null>(null);
  const [userPhotoUrls, setUserPhotoUrls] = useState<Record<string, string>>({});
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [userPhotoProgress, setUserPhotoProgress] = useState(0);
  const [userPhotoError, setUserPhotoError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [companionSwitcherOpen, setCompanionSwitcherOpen] = useState(false);
  const [creatingCompanion, setCreatingCompanion] = useState(false);
  const [manualPaywallOpen, setManualPaywallOpen] = useState(false);
  const [previewPaywallReady, setPreviewPaywallReady] = useState(false);
  const [pendingSubscriptionPlan, setPendingSubscriptionPlan] = useState<"pro" | "ultra" | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [googlePlayProducts, setGooglePlayProducts] = useState<GooglePlayProduct[]>([]);
  const [companionMenuOpen, setCompanionMenuOpen] = useState(false);
  const [activeCompanionPanel, setActiveCompanionPanel] = useState<CompanionPanel | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const [pendingRecordedVoice, setPendingRecordedVoice] = useState<{ asset: AiCompanionVoiceAsset; transcript: string; url: string } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceRecordingStartedAtRef = useRef(0);
  const voiceRecordingTimeoutRef = useRef<number | null>(null);
  const pendingRecordedUrlRef = useRef<string | null>(null);
  const subscriptionReturnHandledRef = useRef(false);

  useEffect(() => {
    const first = companionsQuery.data?.companions[0];
    if (first && !selectedId) setSelectedId(first.id);
  }, [companionsQuery.data?.companions, selectedId]);

  useEffect(() => () => {
    if (voiceRecordingTimeoutRef.current !== null) window.clearTimeout(voiceRecordingTimeoutRef.current);
    if (voiceRecorderRef.current?.state === "recording") { voiceRecorderRef.current.onstop = null; voiceRecorderRef.current.stop(); }
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (pendingRecordedUrlRef.current) URL.revokeObjectURL(pendingRecordedUrlRef.current);
  }, []);

  useEffect(() => {
    setCompanionSwitcherOpen(false);
    setCompanionMenuOpen(false);
    setActiveCompanionPanel(null);
  }, [selectedId]);

  useEffect(() => {
    if (!activeCompanionPanel && !companionSwitcherOpen && !companionMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveCompanionPanel(null);
      setCompanionSwitcherOpen(false);
      setCompanionMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    if (activeCompanionPanel || companionSwitcherOpen) document.body.classList.add("ai-panel-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("ai-panel-open");
    };
  }, [activeCompanionPanel, companionSwitcherOpen, companionMenuOpen]);

  useEffect(() => {
    if (!signupOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSignupOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("ai-panel-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("ai-panel-open");
    };
  }, [signupOpen]);

  useEffect(() => {
    if (!sessionQuery.data?.authenticated || !isNativeAndroidApp() || (!manualPaywallOpen && !previewPaywallReady)) return;
    let cancelled = false;
    const loadBilling = async () => {
      try {
        const recovery = await recoverGooglePlayPurchases();
        if (recovery.recoveredCount) {
          await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
          await queryClient.invalidateQueries({ queryKey: ["ai-companion"] });
          await queryClient.invalidateQueries({ queryKey: ["ai-companion-voice"] });
        }
      } catch {
        // Product loading below can still succeed when there is nothing to restore.
      }
      try {
        const products = await fetchGooglePlaySubscriptionProducts();
        if (!cancelled) setGooglePlayProducts(products);
      } catch {
        if (!cancelled) setGooglePlayProducts([]);
      }
    };
    void loadBilling();
    return () => { cancelled = true; };
  }, [manualPaywallOpen, previewPaywallReady, queryClient, sessionQuery.data?.authenticated]);

  useEffect(() => {
    if (!sessionQuery.data?.authenticated || isNativeAndroidApp()) return;
    refreshAiCompanionSubscription().then(async ({ entitlement }) => {
      if (!entitlement) return;
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion-voice"] });
    }).catch(() => undefined);
  }, [queryClient, sessionQuery.data?.authenticated]);

  useEffect(() => {
    if (subscriptionReturnHandledRef.current || !searchParams.get("subscription_return")) return;
    const checkoutId = searchParams.get("subscription_id") ?? searchParams.get("session_id") ?? searchParams.get("token") ?? window.sessionStorage.getItem(subscriptionCheckoutStorageKey);
    if (!checkoutId) { setSubscriptionError("We could not find this subscription checkout. Please try again."); return; }
    subscriptionReturnHandledRef.current = true;
    setPendingSubscriptionPlan("pro");
    completeAiCompanionSubscriptionCheckout(checkoutId).then(async () => {
      window.sessionStorage.removeItem(subscriptionCheckoutStorageKey);
      setManualPaywallOpen(false);
      setPreviewPaywallReady(false);
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion-voice", selectedId] });
      setSearchParams({}, { replace: true });
    }).catch((error) => setSubscriptionError(error instanceof Error ? error.message : "Unable to confirm subscription.")).finally(() => setPendingSubscriptionPlan(null));
  }, [queryClient, searchParams, selectedId, setSearchParams]);

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
      setCreatingCompanion(false);
      setSelectedId(companion.id);
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
    },
  });
  const messageMutation = useMutation({
    mutationFn: async ({ outgoingMessage, requestVoice, userVoiceAssetId }: { outgoingMessage: string; requestVoice: boolean; userVoiceAssetId?: string }) => {
      const startedAt = Date.now();
      setPhotoRequestError(null);
      setVoiceError(null);
      setPendingUserMessage(outgoingMessage);
      const result = await sendAiCompanionMessage(selectedId!, outgoingMessage, userVoiceAssetId);
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
      clearPendingRecordedVoice();
      await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-companion-voice", selectedId] });
    },
    onError: (error, variables) => {
      setPendingUserMessage(null);
      const errorMessage = error instanceof Error ? error.message : "";
      if (errorMessage.includes("companion photo included with your free preview")) setPhotoRequestError(errorMessage);
      if (variables.userVoiceAssetId && selectedId) void deleteAiCompanionVoiceInput(selectedId, variables.userVoiceAssetId).catch(() => undefined);
      clearPendingRecordedVoice();
    },
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
  const photoReportMutation = useMutation({
    mutationFn: (photoId: string) => reportAiCompanionPhoto(photoId, { reason: reportReason }),
    onSuccess: (_result, photoId) => {
      setReportedPhotoIds((current) => new Set(current).add(photoId));
      setReportingMessageId(null);
    },
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

  function getCompanionDraft() {
    if (!appearanceId) return;
    const appearance = appearancesQuery.data?.appearances.find((option) => option.id === appearanceId);
    if (!appearance) return;
    return { name, identity: appearance.identity, personaKey, appearanceId, backstory, avatarKey: "companion-default", traits: { warmth: 4, playfulness: 3, directness: 3, replyStyle } };
  }
  function create(event: FormEvent) {
    event.preventDefault();
    const draft = getCompanionDraft();
    if (!draft) return;
    if (!sessionQuery.data?.authenticated) {
      setAuthMode("signup");
      setSignupOpen(true);
      return;
    }
    createMutation.mutate(draft);
  }
  async function finishEmbeddedAuth() {
    const draft = getCompanionDraft();
    if (!draft) throw new Error("Choose your companion before continuing.");

    if (authMode === "login") {
      const existing = await fetchAiCompanions();
      if (existing.companions.length) {
        setSelectedId(existing.companions[0].id);
        setCreatingCompanion(false);
        setSignupOpen(false);
        await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
        return;
      }
    }

    await createMutation.mutateAsync(draft);
    setSignupOpen(false);
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (message.trim() && !messageMutation.isPending) messageMutation.mutate({ outgoingMessage: message, requestVoice: /\b(?:send|leave|record)\b[\s\S]{0,30}\bvoice (?:message|note)\b/i.test(message) });
  }
  async function subscribe(plan: "pro" | "ultra") {
    setPendingSubscriptionPlan(plan);
    setSubscriptionError(null);
    try {
      if (isNativeAndroidApp()) {
        const product = googlePlayProducts.find((item) => item.productId === plansQuery.data?.plans.find((candidate) => candidate.key === plan)?.googlePlayProductId);
        const result = await completeGooglePlaySubscription(plan, product);
        if (result.cancelled) return;
        setManualPaywallOpen(false);
        setPreviewPaywallReady(false);
        await queryClient.invalidateQueries({ queryKey: ["ai-companions"] });
        await queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] });
        await queryClient.invalidateQueries({ queryKey: ["ai-companion-voice", selectedId] });
        return;
      }
      const checkout = await createAiCompanionSubscriptionCheckout(plan);
      window.sessionStorage.setItem(subscriptionCheckoutStorageKey, checkout.checkoutId);
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : "Unable to open subscription checkout.");
    } finally {
      setPendingSubscriptionPlan(null);
    }
  }
  async function toggleVoiceRecording() {
    const activeRecorder = voiceRecorderRef.current;
    if (activeRecorder?.state === "recording") {
      if (voiceRecordingTimeoutRef.current !== null) window.clearTimeout(voiceRecordingTimeoutRef.current);
      voiceRecordingTimeoutRef.current = null;
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
        if (voiceRecordingTimeoutRef.current !== null) window.clearTimeout(voiceRecordingTimeoutRef.current);
        voiceRecordingTimeoutRef.current = null;
        voiceRecorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        setVoiceRecording(false);
        setVoiceTranscribing(true);
        try {
          const audio = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const durationMs = Math.max(250, Date.now() - voiceRecordingStartedAtRef.current);
          const result = await transcribeAiCompanionVoiceInput(selectedId!, audio, durationMs);
          const url = URL.createObjectURL(audio);
          pendingRecordedUrlRef.current = url;
          setPendingRecordedVoice({ asset: result.voiceAsset, transcript: result.transcript, url });
          messageMutation.mutate({ outgoingMessage: result.transcript, requestVoice: true, userVoiceAssetId: result.voiceAsset.id });
        } catch (error) { setVoiceError(error instanceof Error ? error.message : "The voice message could not be sent."); }
        finally { setVoiceTranscribing(false); }
      };
      voiceRecorderRef.current = recorder;
      voiceRecordingStartedAtRef.current = Date.now();
      recorder.start();
      setVoiceRecording(true);
      if (voiceQuery.data?.voice.freeTrialAvailable) {
        const maximumMs = Math.max(1_000, voiceQuery.data.voice.maxDurationSeconds * 1_000 - 250);
        voiceRecordingTimeoutRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, maximumMs);
      }
    } catch { setVoiceError("Microphone access is needed to record a voice message."); }
  }
  function clearPendingRecordedVoice() {
    if (pendingRecordedUrlRef.current) URL.revokeObjectURL(pendingRecordedUrlRef.current);
    pendingRecordedUrlRef.current = null;
    setPendingRecordedVoice(null);
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
  const previewComplete = detail?.entitlement.plan === "free" && detail.conversation.trialRepliesUsed >= detail.entitlement.messageLimit;
  const paywallVisible = Boolean(detail && (manualPaywallOpen || previewPaywallReady));
  useEffect(() => {
    if (!previewComplete) { setPreviewPaywallReady(false); return; }
    const timer = window.setTimeout(() => setPreviewPaywallReady(true), 1400);
    return () => window.clearTimeout(timer);
  }, [detail?.companion.id, previewComplete]);
  useEffect(() => {
    if (!paywallVisible) return;
    document.body.classList.add("ai-panel-open");
    return () => document.body.classList.remove("ai-panel-open");
  }, [paywallVisible]);
  const companionPersona = personas.find((persona) => persona.key === detail?.companion.personaKey);
  let companionReplyStyle = "Natural";
  if (detail?.companion.traitsJson) {
    try {
      const traits = JSON.parse(detail.companion.traitsJson) as { replyStyle?: "short" | "natural" | "detailed" };
      companionReplyStyle = traits.replyStyle === "short" ? "Short & texty" : traits.replyStyle === "detailed" ? "Detailed" : "Natural";
    } catch { companionReplyStyle = "Natural"; }
  }
  const calls = detail?.calls ?? [];
  const callMessageIds = new Set(calls.flatMap((call) => call.turns.flatMap((turn) => [turn.userMessageId, turn.assistantMessageId].filter((messageId): messageId is string => Boolean(messageId)))));
  const chatTimeline = detail ? [
    ...detail.messages.filter((item) => !callMessageIds.has(item.id)).map((item) => ({ kind: "message" as const, createdAt: item.createdAt, item })),
    ...detail.deliveredPhotos.map((photo) => ({ kind: "companion-photo" as const, createdAt: photo.createdAt, photo })),
    ...calls.map((call) => ({ kind: "call" as const, createdAt: call.connectedAt ?? call.createdAt, call })),
  ].sort((left, right) => left.createdAt - right.createdAt) : [];
  const selectedCall = calls.find((call) => call.id === selectedCallId) ?? null;
  // Casting and visual-identity review are an internal development workflow.
  // Public companion conversations must never expose these controls or states.
  const showInternalVisualIdentityControls = false;

  useEffect(() => {
    if (!detail) return;
    const scrollToLatest = () => {
      const messages = messagesRef.current;
      if (messages) scrollChatToLatest(messages);
    };
    const frame = window.requestAnimationFrame(scrollToLatest);
    const timer = window.setTimeout(scrollToLatest, 80);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [detail?.conversation.id, detail?.messages.length, detail?.deliveredPhotos.length, calls.length, Object.keys(userPhotoUrls).length, Object.keys(deliveredPhotoUrls).length, pendingUserMessage]);

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
    if (!selectedId || !deliveredPhotoIds) { setDeliveredPhotoUrls({}); setDeliveredPhotoErrors(new Set()); return; }
    let cancelled = false;
    const urls: string[] = [];
    setDeliveredPhotoUrls({});
    setDeliveredPhotoErrors(new Set());
    deliveredPhotoIds.split(",").forEach((photoId) => {
      fetchAiCompanionDeliveredPhoto(selectedId, photoId).then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        urls.push(url);
        setDeliveredPhotoUrls((current) => ({ ...current, [photoId]: url }));
      }).catch(() => {
        if (!cancelled) setDeliveredPhotoErrors((current) => new Set(current).add(photoId));
      });
    });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [deliveredPhotoIds, deliveredPhotoLoadRevision, selectedId]);

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
      {!selectedId ? <section className="ai-hero">
        <p className="eyebrow">PRIVATE AI COMPANIONS</p>
        <h1>A conversation that gets to know you.</h1>
        <p>Build one adult virtual companion for private, clearly AI-labelled conversations. You stay in control of what is remembered.</p>
      </section> : null}

      {companionsQuery.isLoading ? <p className="status-message">Loading your companion space...</p> : null}
      {companionsQuery.error ? <p className="form-error">{companionsQuery.error.message}</p> : null}
      {selectedId && detailQuery.isLoading ? <p className="status-message">Loading your companion...</p> : null}
      {selectedId && detailQuery.error ? <p className="form-error">Unable to load your companion: {detailQuery.error.message}</p> : null}

      {detail && paywallVisible && plansQuery.data ? <AiCompanionPaywall
        companion={detail.companion}
        plans={plansQuery.data.plans}
        prices={Object.fromEntries(plansQuery.data.plans.map((plan) => [plan.key, googlePlayProducts.find((product) => product.productId === plan.googlePlayProductId)?.formattedPrice]).filter((entry): entry is ["pro" | "ultra", string] => Boolean(entry[1])))}
        isAndroid={isNativeAndroidApp()}
        pendingPlan={pendingSubscriptionPlan}
        currentPlan={detail.entitlement.plan}
        error={subscriptionError}
        onSubscribe={(plan) => { void subscribe(plan); }}
      /> : null}

      {detail && paywallVisible && plansQuery.isLoading ? <p className="status-message ai-upgrade-loading">Preparing your options...</p> : null}

      {!paywallVisible && (sessionQuery.data?.authenticated === false || (sessionQuery.data?.authenticated && canCreate && (!selectedId || creatingCompanion))) ? (
        <section className="ai-create-card">
          <div>
            <p className="eyebrow">CREATE YOUR COMPANION</p>
            <h2>{sessionQuery.data?.authenticated ? "Start with a personality, then make it yours." : "Choose who you would like to meet."}</h2>
            <p className="muted">{sessionQuery.data?.authenticated ? "Your companion is AI, not a real person. This first preview includes up to 15 replies. Photos are identity-verified, and eligible plans can use private voice notes and turn-based calls." : "Pick their personality, appearance, and name first. When everything feels right, you can save your companion with just your name, email, and a password."}</p>
            {creatingCompanion && detail ? <button className="secondary-button ai-create-back" type="button" onClick={() => setCreatingCompanion(false)}>Back to {detail.companion.name}</button> : null}
          </div>
          <form className="ai-create-form" onSubmit={create}>
            <fieldset className="ai-persona-fieldset"><legend>Personality</legend><div className="ai-persona-grid">{personas.map((persona) => <button type="button" key={persona.key} className={personaKey === persona.key ? "ai-persona ai-persona-selected" : "ai-persona"} onClick={() => setPersonaKey(persona.key)}><strong>{persona.title}</strong><span>{persona.description}</span></button>)}</div></fieldset>
            <fieldset className="ai-persona-fieldset"><legend>Appearance</legend><p className="muted">Choose one approved fictional adult appearance. This identity stays fixed regardless of personality or the private name you choose.</p><div className="ai-appearance-grid">{appearancesQuery.data?.appearances.map((appearance) => <button type="button" key={appearance.id} className={appearanceId === appearance.id ? "ai-appearance ai-appearance-selected" : "ai-appearance"} onClick={() => setAppearanceId(appearance.id)}><img src={getAiCompanionAppearancePreviewUrl(appearance.id)} alt={`${appearance.name} appearance option`} loading="lazy" decoding="async" /><strong>{appearance.name}</strong></button>)}</div>{appearancesQuery.error ? <p className="form-error">Unable to load appearance options.</p> : null}</fieldset>
            <label>Private name<input value={name} maxLength={30} placeholder="What would you like to call them?" onChange={(event) => setName(event.target.value)} /><span className="muted">This is only your label for the companion; it never changes their appearance.</span></label>
            <label>Reply style<select value={replyStyle} onChange={(event) => setReplyStyle(event.target.value as typeof replyStyle)}><option value="short">Short &amp; texty</option><option value="natural">Natural</option><option value="detailed">Detailed</option></select></label>
            <label>Short backstory <span className="muted">optional</span><textarea value={backstory} maxLength={500} placeholder="A few details that make this companion feel distinct..." onChange={(event) => setBackstory(event.target.value)} /></label>
            {createMutation.error ? <p className="form-error">{createMutation.error.message}</p> : null}
            <button className="primary-button" disabled={createMutation.isPending || !appearanceId || name.trim().length < 2}>{createMutation.isPending ? "Creating..." : sessionQuery.data?.authenticated ? "Create companion" : "Continue and save companion"}</button>
            {sessionQuery.data?.authenticated === false ? <p className="ai-create-account-note">Already have a Velora account? <button type="button" className="auth-mode-link" onClick={() => { setAuthMode("login"); setSignupOpen(true); }}>Log in</button></p> : null}
          </form>
        </section>
      ) : null}

      {sessionQuery.data?.authenticated && !paywallVisible && creatingCompanion && !canCreate ? <section className="ai-create-card ai-companion-limit-card">
        <div>
          <p className="eyebrow">YOUR COMPANIONS</p>
          <h2>{detail?.entitlement.plan === "ultra" ? "Ultra currently supports up to two companions." : "Your current plan already includes its companion."}</h2>
          <p className="muted">{detail?.entitlement.plan === "ultra" ? "Your two existing companions and their conversations stay exactly as they are. Velora will never replace one automatically." : `You can keep chatting with ${detail?.companion.name ?? "your companion"}. More companion spaces will appear here when they become available for your plan.`}</p>
          <button className="secondary-button ai-create-back" type="button" onClick={() => setCreatingCompanion(false)}>Back to {detail?.companion.name ?? "chat"}</button>
        </div>
      </section> : null}

      {detail && !creatingCompanion && !paywallVisible ? <section className="ai-companion-workspace">
        <div className="ai-chat-card">
          <header className="ai-chat-header">
            <div className="ai-companion-identity-wrap">
              <button className="ai-chat-identity" type="button" aria-label={`Choose companion. ${detail.companion.name} is active`} aria-expanded={companionSwitcherOpen} aria-haspopup="dialog" onClick={() => { setCompanionSwitcherOpen((open) => !open); setCompanionMenuOpen(false); }}>
                <span className="ai-avatar">{companionInitial(detail.companion)}</span>
                <span><small>AI COMPANION</small><strong>{detail.companion.name}</strong><em>{relationshipStageLabel[detail.conversation.relationshipStage]}</em></span>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
              </button>
              {companionSwitcherOpen ? <>
                <div className="ai-companion-switcher-backdrop" aria-hidden="true" onMouseDown={() => setCompanionSwitcherOpen(false)} />
                <div className="ai-companion-switcher" role="dialog" aria-modal="true" aria-labelledby="ai-companion-switcher-title">
                  <div className="ai-companion-switcher-heading">
                    <strong id="ai-companion-switcher-title">Your companions</strong>
                    <button type="button" aria-label="Close companion selector" onClick={() => setCompanionSwitcherOpen(false)}>×</button>
                  </div>
                  <div className="ai-companion-switcher-list">
                    {companionsQuery.data?.companions.map((companion) => <button className={companion.id === selectedId ? "ai-companion-option ai-companion-option-selected" : "ai-companion-option"} type="button" key={companion.id} aria-current={companion.id === selectedId ? "true" : undefined} onClick={() => { setSelectedId(companion.id); setCompanionSwitcherOpen(false); }}><span className="ai-avatar">{companionInitial(companion)}</span><strong>{companion.name}</strong>{companion.id === selectedId ? <span className="ai-companion-check" aria-label="Current companion">✓</span> : null}</button>)}
                  </div>
                  <button className="ai-meet-companion-option" type="button" onClick={() => { createMutation.reset(); setCompanionSwitcherOpen(false); if (canCreate || detail.entitlement.plan === "ultra") setCreatingCompanion(true); else setManualPaywallOpen(true); }}>+ Meet another companion</button>
                </div>
              </> : null}
            </div>
            <div className="ai-chat-actions">
              {detail.entitlement.plan === "free" ? <span className="ai-trial-counter">{Math.max(0, detail.entitlement.messageLimit - detail.conversation.trialRepliesUsed)} preview replies left</span> : null}
              <button className="ai-call-button" type="button" aria-label={`Call ${detail.companion.name}`} title={voiceQuery.data?.calls.enabled ? `Call ${detail.companion.name}` : "Voice calls are available with Velora Pro or Ultra"} onClick={() => setCallOpen(true)} disabled={!voiceQuery.data?.calls.enabled}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.7 3.3 3.4 5 6.7 6.7l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.7 3.9.7.6 0 1 .4 1 1v3.7c0 .6-.4 1-1 1C10.6 21.5 2.5 13.4 2.5 3.5c0-.6.4-1 1-1h3.7c.6 0 1 .4 1 1 0 1.4.2 2.7.7 3.9.1.4 0 .8-.3 1.1z" /></svg></button>
              <div className="ai-companion-menu-wrap">
                <button className="ai-companion-menu-button" type="button" aria-label="Companion menu" aria-expanded={companionMenuOpen} onClick={() => { setCompanionMenuOpen((open) => !open); setCompanionSwitcherOpen(false); }}><span aria-hidden="true">•••</span></button>
                {companionMenuOpen ? <div className="ai-companion-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setActiveCompanionPanel("memories"); setCompanionMenuOpen(false); }}><span aria-hidden="true">♡</span><span><strong>Memories &amp; Journal</strong><small>What {detail.companion.name} remembers</small></span></button>
                  <button type="button" role="menuitem" onClick={() => { setActiveCompanionPanel("profile"); setCompanionMenuOpen(false); }}><span aria-hidden="true">◯</span><span><strong>Companion profile</strong><small>Personality and connection</small></span></button>
                  <button type="button" role="menuitem" onClick={() => { setActiveCompanionPanel("photos"); setCompanionMenuOpen(false); }}><span aria-hidden="true">▧</span><span><strong>Photos</strong><small>Photos shared in this chat</small></span></button>
                  <button type="button" role="menuitem" onClick={() => { setActiveCompanionPanel("settings"); setCompanionMenuOpen(false); }}><span aria-hidden="true">⚙</span><span><strong>Settings</strong><small>Voice, photos, and safety</small></span></button>
                </div> : null}
              </div>
            </div>
          </header>
          {!detail.aiEnabled ? <div className="ai-disabled-note">This private companion preview is not available for this account yet. We are opening it gradually while we review safety and usage.</div> : null}
          {showInternalVisualIdentityControls && detail.aiEnabled && (!detail.visualIdentity || detail.visualIdentity.status === "pending_storage") ? <div className="ai-disabled-note"><button className="text-button" onClick={() => visualIdentityMutation.mutate()} disabled={visualIdentityMutation.isPending}>Generate casting options</button></div> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "casting_review" ? <div className="ai-disabled-note"><div className="ai-casting-candidate-grid">{detail.castingCandidates.filter((candidate) => candidate.status === "candidate").map((candidate) => <article className="ai-casting-candidate-card" key={candidate.id}>{castingCandidateUrls[candidate.id] ? <img src={castingCandidateUrls[candidate.id]} alt={`${detail.companion.name} casting option ${candidate.sortOrder + 1}`} /> : null}<button className="secondary-button" onClick={() => selectCastingCandidateMutation.mutate(candidate.id)}>Choose option {candidate.sortOrder + 1}</button></article>)}</div></div> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "casting_selected" ? <button className="text-button" onClick={() => completeVisualIdentityMutation.mutate()}>Build six canonical views</button> : null}
          {showInternalVisualIdentityControls && detail.visualIdentity?.status === "review" ? <div className="ai-disabled-note"><button className="text-button" onClick={() => lifestyleTestMutation.mutate()}>Run lifestyle test</button><button className="text-button" onClick={() => approveVisualIdentityMutation.mutate()}>Approve canonical identity</button></div> : null}
          <div className="ai-messages" ref={messagesRef}>
            {chatTimeline.length === 0 && !pendingUserMessage ? <div className="ai-empty-chat"><strong>Say hello to {detail.companion.name}.</strong><span>This is a private AI conversation. You can view and delete saved memories any time.</span></div> : chatTimeline.map((entry) => {
              if (entry.kind === "companion-photo") return <article className="ai-message ai-message-assistant ai-photo-message" key={`companion-photo-${entry.photo.id}`}>
                <div className="ai-photo-content">
                  {deliveredPhotoUrls[entry.photo.id] ? <img src={deliveredPhotoUrls[entry.photo.id]} alt={`${detail.companion.name} shared companion photo`} onLoad={() => { const messages = messagesRef.current; if (messages && entry.photo.id === detail.deliveredPhotos[detail.deliveredPhotos.length - 1]?.id) scrollChatToLatest(messages); }} /> : deliveredPhotoErrors.has(entry.photo.id) ? <div className="ai-photo-load-state"><span>The photo could not be displayed.</span><button className="text-button" type="button" onClick={() => setDeliveredPhotoLoadRevision((revision) => revision + 1)}>Try again</button></div> : <div className="ai-photo-load-state" aria-live="polite"><span className="ai-voice-spinner" /><span>Opening photo…</span></div>}
                  {deliveredPhotoUrls[entry.photo.id] ? reportedPhotoIds.has(entry.photo.id) ? <span className="ai-photo-report-thanks">Reported — thank you</span> : <button className="ai-report-trigger ai-photo-report-trigger" type="button" aria-label="Report photo" title="Report photo" onClick={() => setReportingMessageId((current) => current === entry.photo.id ? null : entry.photo.id)}><span aria-hidden="true">i</span></button> : null}
                </div>
                {reportingMessageId === entry.photo.id ? <div className="ai-report"><select aria-label="Reason for reporting this photo" value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)}><option value="unsafe">Unsafe or disturbing</option><option value="harmful">Harmful</option><option value="sexual_content">Sexual content</option><option value="misleading">Misleading</option><option value="other">Other</option></select><button className="secondary-button" onClick={() => photoReportMutation.mutate(entry.photo.id)} disabled={photoReportMutation.isPending}>Submit report</button></div> : null}
              </article>;
              if (entry.kind === "call") return <article className="ai-call-log" key={entry.call.id}>
                <span className="ai-call-log-icon" aria-hidden="true">📞</span>
                <div><strong>Voice call with {detail.companion.name} <span>· {compactCallDuration(entry.call)}</span></strong><button className="text-button" type="button" onClick={() => setSelectedCallId(entry.call.id)}>View transcript</button></div>
              </article>;
              const item = entry.item;
              const attachedPhoto = userPhotoByMessageId.get(item.id);
              const voiceAsset = voiceByMessageId.get(item.id);
              return <article className={`${item.role === "user" ? "ai-message ai-message-user" : "ai-message ai-message-assistant"}${attachedPhoto ? " ai-photo-message" : ""}`} key={item.id}>
                {attachedPhoto && userPhotoUrls[attachedPhoto.id] ? <><img src={userPhotoUrls[attachedPhoto.id]} alt="Photo you sent to your AI companion" /><button className="ai-photo-remove" type="button" onClick={() => userPhotoDeleteMutation.mutate(attachedPhoto.id)} disabled={userPhotoDeleteMutation.isPending}>Remove</button></> : voiceAsset ? <CompanionVoiceNote companionId={detail.companion.id} asset={voiceAsset} transcript={item.body} /> : <p>{item.body}</p>}
                {item.role === "assistant" ? <button className="ai-report-trigger" type="button" aria-label="Report response" title="Report response" onClick={() => setReportingMessageId((current) => current === item.id ? null : item.id)}><span aria-hidden="true">i</span></button> : null}
                {reportingMessageId === item.id ? <div className="ai-report"><select value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)}><option value="unsafe">Unsafe or crisis handling</option><option value="harmful">Harmful or manipulative</option><option value="sexual_content">Sexual content</option><option value="misleading">Misleading</option><option value="other">Other</option></select><button className="secondary-button" onClick={() => reportMutation.mutate(item.id)} disabled={reportMutation.isPending}>Submit report</button></div> : null}
              </article>;
            })}
            {pendingUserMessage ? <><article className="ai-message ai-message-user">{pendingRecordedVoice ? <CompanionVoiceNote companionId={detail.companion.id} asset={pendingRecordedVoice.asset} transcript={pendingRecordedVoice.transcript} initialUrl={pendingRecordedVoice.url} /> : <p>{pendingUserMessage}</p>}</article><div className="ai-typing" aria-label={`${detail.companion.name} is thinking`}><i /><i /><i /></div></> : null}
          </div>
          <form className="ai-composer" onSubmit={send}>
            <div className="ai-attachment-control">
              <button className="ai-attachment-button" type="button" aria-label="Attach a photo" aria-expanded={photoMenuOpen} onClick={() => setPhotoMenuOpen((open) => !open)} disabled={!detail.aiEnabled || userPhotoUploadMutation.isPending}>+</button>
              {photoMenuOpen ? <div className="ai-attachment-menu"><label className="ai-photo-picker">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseUserPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><label className="ai-photo-picker">Take selfie<input type="file" accept="image/*" capture="user" onChange={(event) => { void chooseUserPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div> : null}
            </div>
            <textarea value={message} maxLength={1000} placeholder={previewComplete ? "Your free preview is complete" : voiceRecording ? "Recording… tap stop when you're finished" : voiceTranscribing ? "Preparing your voice message…" : `Message ${detail.companion.name}...`} onChange={(event) => setMessage(event.target.value)} disabled={!detail.aiEnabled || previewComplete || messageMutation.isPending || voiceRecording || voiceTranscribing} />
            {message.trim() ? <button className="ai-send-button" type="submit" aria-label="Send message" disabled={!detail.aiEnabled || previewComplete || messageMutation.isPending}>{messageMutation.isPending ? <span className="ai-voice-spinner" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 20 18-8L3 4v6l13 2-13 2z" /></svg>}</button> : <button className={`ai-mic-button${voiceRecording ? " recording" : ""}`} type="button" aria-label={voiceRecording ? "Finish voice message" : `Record a voice message for ${detail.companion.name}`} title={voiceRecording ? "Tap to finish" : "Record a voice message"} onClick={toggleVoiceRecording} disabled={!detail.aiEnabled || previewComplete || !voiceQuery.data?.voice.enabled || messageMutation.isPending || voiceTranscribing}>{voiceTranscribing ? <span className="ai-voice-spinner" /> : voiceRecording ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z" /></svg>}</button>}
            {selectedUserPhotoUrl ? <div className="ai-attachment-preview"><img src={selectedUserPhotoUrl} alt="Photo ready to send" /><div><strong>Ready to send privately</strong><small>It will appear in chat only after safety review.</small><span><button className="primary-button" type="button" onClick={() => userPhotoUploadMutation.mutate()} disabled={userPhotoUploadMutation.isPending}>{userPhotoUploadMutation.isPending ? userPhotoProgress >= 100 ? "Reviewing..." : `Uploading ${userPhotoProgress}%` : "Send photo"}</button><button className="text-button" type="button" onClick={() => { URL.revokeObjectURL(selectedUserPhotoUrl); setSelectedUserPhoto(null); setSelectedUserPhotoUrl(null); setUserPhotoProgress(0); setUserPhotoError(null); }} disabled={userPhotoUploadMutation.isPending}>Cancel</button></span></div></div> : null}
            {userPhotoUploadMutation.isPending ? <progress max="100" value={userPhotoProgress} aria-label="Photo upload progress" /> : null}
            {userPhotoQuery.data?.quota ? <small className="ai-photo-quota">{userPhotoQuery.data.quota.monthlyLimit > 0 ? `${userPhotoQuery.data.quota.remaining} of ${userPhotoQuery.data.quota.monthlyLimit} photo sends left this month` : "Photo sending is available with Velora Pro or Ultra"}</small> : null}
            {userPhotoError ? <p className="form-error">{userPhotoError}</p> : null}
            {userPhotoDeleteMutation.error ? <p className="form-error">{userPhotoDeleteMutation.error.message}</p> : null}
            {messageMutation.error && !photoRequestError ? <p className="form-error">{messageMutation.error.message}</p> : null}
            {photoRequestError ? <div className="ai-friendly-limit-notice" role="status"><span aria-hidden="true">📷</span><p>{photoRequestError}</p>{photoRequestError.includes("free preview") ? <button className="text-button" type="button" onClick={() => setManualPaywallOpen(true)}>See Pro &amp; Ultra</button> : null}</div> : null}
            {voiceError ? <p className="form-error">Voice note: {voiceError}</p> : null}
            {voiceQuery.data ? <small className="ai-voice-quota">{voiceAvailabilityText(voiceQuery.data.voice)}</small> : null}
          </form>
        </div>
      </section> : null}
      {detail && activeCompanionPanel ? <div className="ai-companion-panel-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setActiveCompanionPanel(null); }}>
        <aside className="ai-companion-panel" role="dialog" aria-modal="true" aria-labelledby="ai-companion-panel-title">
          <header>
            <div>
              <p className="eyebrow">{activeCompanionPanel === "memories" ? "JOURNAL OF US" : "AI COMPANION"}</p>
              <h2 id="ai-companion-panel-title">{activeCompanionPanel === "memories" ? `What ${detail.companion.name} remembers` : activeCompanionPanel === "profile" ? `${detail.companion.name}'s profile` : activeCompanionPanel === "photos" ? "Photos from your chat" : "Companion settings"}</h2>
            </div>
            <button className="ai-panel-close" type="button" aria-label="Close" onClick={() => setActiveCompanionPanel(null)}>×</button>
          </header>
          <div className="ai-companion-panel-body">
            {activeCompanionPanel === "memories" ? <>
              <p className="muted">You control every long-term memory. Review suggestions before they are saved.</p>
              {detail.memoryCandidates.length > 0 ? <section className="ai-memory-candidates"><strong>Suggested memories</strong>{detail.memoryCandidates.map((candidate) => <div key={candidate.id}><span>{candidate.content}</span><div><button className="secondary-button" onClick={() => approveMemoryCandidateMutation.mutate(candidate.id)} disabled={approveMemoryCandidateMutation.isPending || dismissMemoryCandidateMutation.isPending}>Keep</button><button className="text-button" onClick={() => dismissMemoryCandidateMutation.mutate(candidate.id)} disabled={approveMemoryCandidateMutation.isPending || dismissMemoryCandidateMutation.isPending}>Dismiss</button></div></div>)}</section> : null}
              <form className="ai-memory-form" onSubmit={saveMemory}><textarea value={memory} maxLength={280} placeholder="Example: I start a new job on Monday." onChange={(event) => setMemory(event.target.value)} /><button className="secondary-button" disabled={memoryMutation.isPending || !memory.trim()}>Save memory</button></form>
              <div className="ai-memory-list">{detail.memories.map((item) => <div key={item.id}><span>{item.content}</span><button className="text-button" onClick={() => deleteMemoryMutation.mutate(item.id)}>Delete</button></div>)}{detail.memories.length === 0 ? <p className="ai-panel-empty">Nothing has been saved yet.</p> : null}</div>
            </> : null}
            {activeCompanionPanel === "profile" ? <>
              <section className="ai-profile-summary">
                <span className="ai-avatar ai-profile-avatar">{companionInitial(detail.companion)}</span>
                <div><h3>{detail.companion.name}</h3><p>AI companion · {relationshipStageLabel[detail.conversation.relationshipStage]}</p></div>
              </section>
              <dl className="ai-companion-facts">
                <div><dt>Personality</dt><dd>{companionPersona?.title ?? "Personal companion"}</dd></div>
                <div><dt>Reply style</dt><dd>{companionReplyStyle}</dd></div>
                <div><dt>Connection</dt><dd>{relationshipStageLabel[detail.conversation.relationshipStage]}</dd></div>
              </dl>
              <section className="ai-profile-story"><h3>About {detail.companion.name}</h3><p>{detail.companion.backstory.trim() || companionPersona?.description || "A private companion created for conversations that grow with you."}</p></section>
              <div className="ai-safety-note"><strong>Always AI.</strong><span>{detail.companion.name} is a fictional AI companion, not a real person.</span></div>
            </> : null}
            {activeCompanionPanel === "photos" ? <>
              <section className="ai-photo-library"><h3>From {detail.companion.name}</h3>{detail.deliveredPhotos.length ? <div className="ai-photo-library-grid">{detail.deliveredPhotos.map((photo) => deliveredPhotoUrls[photo.id] ? <img key={photo.id} src={deliveredPhotoUrls[photo.id]} alt={`${detail.companion.name} shared companion photo`} /> : null)}</div> : <p className="ai-panel-empty">No companion photos have been shared yet.</p>}</section>
              <section className="ai-photo-library"><h3>From you</h3>{detail.userPhotos.length ? <div className="ai-photo-library-grid">{detail.userPhotos.map((photo) => userPhotoUrls[photo.id] ? <img key={photo.id} src={userPhotoUrls[photo.id]} alt="Photo you shared in this companion chat" /> : null)}</div> : <p className="ai-panel-empty">You have not shared any photos in this chat.</p>}</section>
              <p className="ai-panel-note">Only photos already shared in this conversation appear here.</p>
            </> : null}
            {activeCompanionPanel === "settings" ? <>
              <section className="ai-settings-list">
                <div><span>Plan</span><strong>{detail.entitlement.plan === "free" ? "Velora Free" : detail.entitlement.plan === "pro" ? "Velora Pro" : "Velora Ultra"}</strong></div>
                <div><span>Reply style</span><strong>{companionReplyStyle}</strong></div>
                <div><span>Voice messages</span><strong>{voiceQuery.data?.voice.freeTrialAvailable ? "1 free message · up to 1 minute" : voiceQuery.data?.voice.freeTrialUsed ? "Free message used" : voiceQuery.data?.voice.enabled ? "Available" : "Velora Pro or Ultra required"}</strong></div>
                <div><span>Voice calls</span><strong>{voiceQuery.data?.calls.enabled ? "Available" : "Velora Pro or Ultra required"}</strong></div>
              </section>
              <div className="ai-safety-note"><strong>Always AI.</strong><span>Private chats are not a substitute for real-world emergency or professional support.</span></div>
              <p className="ai-panel-note">Photos and voice messages keep their existing privacy and retention behavior.</p>
            </> : null}
          </div>
        </aside>
      </div> : null}
      {signupOpen ? <div className="ai-account-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSignupOpen(false); }}>
        <section className="ai-account-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-account-dialog-title">
          <button className="ai-panel-close" type="button" aria-label="Close account creation" onClick={() => setSignupOpen(false)}>×</button>
          <div id="ai-account-dialog-title" className="sr-only">{authMode === "signup" ? "Save your companion with a Velora account" : "Log in to continue"}</div>
          <AuthForm mode={authMode} embedded onModeChange={setAuthMode} onSuccess={finishEmbeddedAuth} />
        </section>
      </div> : null}
      {detail && callOpen && voiceQuery.data ? <CompanionCallDialog companion={detail.companion} capabilities={voiceQuery.data} onClose={() => setCallOpen(false)} onConversationChanged={() => { void queryClient.invalidateQueries({ queryKey: ["ai-companion", selectedId] }); void queryClient.invalidateQueries({ queryKey: ["ai-companion-voice", selectedId] }); }} /> : null}
      {detail && selectedCall ? <CompanionCallDetails call={selectedCall} companionId={detail.companion.id} companionName={detail.companion.name} onClose={() => setSelectedCallId(null)} /> : null}
    </main>
  );
}
