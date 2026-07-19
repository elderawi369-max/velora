const blockedPatterns = [
  /\b(?:https?:\/\/|www\.)\S+/i,
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
  /\b(?:telegram|whatsapp|snapchat|discord|instagram|tiktok)\b/i,
  /@\w{2,}/i,
  /\b\d{7,}\b/,
];

export function containsBlockedContactInfo(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/\s*\(\s*at\s*\)\s*/g, "@")
    .replace(/\s*\[\s*at\s*\]\s*/g, "@")
    .replace(/\s+at\s+/g, "@")
    .replace(/\s*\(\s*dot\s*\)\s*/g, ".")
    .replace(/\s*\[\s*dot\s*\]\s*/g, ".")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+/g, "");

  const obfuscatedEmailLike = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(normalized);

  return obfuscatedEmailLike || blockedPatterns.some((pattern) => pattern.test(input));
}
