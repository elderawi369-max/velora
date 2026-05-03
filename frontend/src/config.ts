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
  "non-binary",
  "prefer not to say",
] as const;

export const lookingForOptions = [
  "women",
  "men",
  "non-binary people",
  "any",
] as const;

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

export const avatarOptions = [
  "rose",
  "halo",
  "nova",
  "echo",
  "velvet",
  "luna",
] as const;
