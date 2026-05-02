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

export const boundaryOptions = [
  "no off-app contact",
  "no explicit chat",
  "slow replies are okay",
  "respect quiet time",
  "friendly flirting only",
  "no pressure conversations",
  "kind tone only",
  "text-only always",
] as const;

export const avatarOptions = [
  "rose",
  "halo",
  "nova",
  "echo",
  "velvet",
  "luna",
] as const;

