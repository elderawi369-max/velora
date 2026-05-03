export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export const vibeOptions = [
  "sweet",
  "playful",
  "deep talker",
  "listener",
  "flirty",
  "teasing",
  "soft-spoken",
  "late-night chatter",
] as const;

export const identityOptions = [
  "woman",
  "man",
  "prefer not to say",
] as const;

export const lookingForOptions = [
  "women",
  "men",
  "any",
] as const;

export const personalityTypeOptions = [
  "clingy / affectionate",
  "cold / mysterious",
  "flirty / teasing",
  "protective",
  "soft / sweet",
  "intellectual",
  "funny / chaotic",
  "confident / dominant",
  "emotionally distant",
  "roleplay / fantasy",
] as const;

export const personalityTypeDescriptions: Record<
  (typeof personalityTypeOptions)[number],
  string
> = {
  "clingy / affectionate": "Warm, attached, emotional energy that texts first and stays engaged.",
  "cold / mysterious": "Shorter replies, harder to read, and a little tension that makes people lean in.",
  "flirty / teasing": "Playful push-pull banter with sarcastic, fun, lightly dangerous chemistry.",
  protective: "Caring, grounded, and strong with a safe, watchful tone.",
  "soft / sweet": "Kind, gentle, supportive energy built for comfort and emotional connection.",
  intellectual: "Thoughtful, curious conversation with depth, reflection, and real questions.",
  "funny / chaotic": "Jokes, unpredictability, and lively energy that keeps chats moving.",
  "confident / dominant": "Bold, leading energy with strong presence and attraction.",
  "emotionally distant": "More realistic, slower, less invested energy that should be used carefully.",
  "roleplay / fantasy": "Character-driven energy for anime, stranger, CEO, or other imagined dynamics.",
};

export const personalityTypeAvatarMap: Record<
  (typeof personalityTypeOptions)[number],
  string
> = {
  "clingy / affectionate": "rose",
  "cold / mysterious": "luna",
  "flirty / teasing": "velvet",
  protective: "halo",
  "soft / sweet": "rose",
  intellectual: "echo",
  "funny / chaotic": "nova",
  "confident / dominant": "velvet",
  "emotionally distant": "luna",
  "roleplay / fantasy": "halo",
};

export const personalityTypeIcons: Record<
  (typeof personalityTypeOptions)[number],
  string
> = {
  "clingy / affectionate": "💕",
  "cold / mysterious": "🧊",
  "flirty / teasing": "😈",
  protective: "🛡️",
  "soft / sweet": "🌸",
  intellectual: "🧠",
  "funny / chaotic": "😂",
  "confident / dominant": "🔥",
  "emotionally distant": "💔",
  "roleplay / fantasy": "🎭",
};

export const identityFallbackIcons = {
  woman: "👩",
  man: "👨",
  "prefer not to say": "✨",
} as const;

export function formatIdentityLabel(identity: string) {
  if (identity === "woman") {
    return "Woman";
  }

  if (identity === "man") {
    return "Man";
  }

  return "Identity private";
}

export function formatLookingForLabel(lookingFor: string) {
  if (lookingFor === "women") {
    return "Open to women";
  }

  if (lookingFor === "men") {
    return "Open to men";
  }

  return "Open to anyone";
}

export function formatTrustLevelLabel(trustLevel: string) {
  if (trustLevel === "trusted") {
    return "Trusted profile";
  }

  if (trustLevel === "established") {
    return "Established profile";
  }

  return "New profile";
}

export const profilePromptOptions = [
  "My ideal chat energy is...",
  "I reply best when...",
  "One thing I always enjoy talking about is...",
  "A conversation feels safe to me when...",
  "The kind of attention I appreciate most is...",
  "If you want to get my interest, start with...",
] as const;

export const platformRules = [
  "No off-app contact",
  "Text-only stays in Velora",
  "No harassment or impersonation",
  "No spam or begging",
] as const;

export const preferenceOptions = [
  "no explicit chat",
  "slow replies are okay",
  "respect quiet time",
  "friendly flirting only",
  "no pressure conversations",
  "kind tone only",
] as const;
