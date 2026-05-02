const blockedPatterns = [
  /\b(?:https?:\/\/|www\.)\S+/i,
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
  /\b(?:telegram|whatsapp|snapchat|discord|instagram|tiktok)\b/i,
  /@\w{2,}/i,
  /\b\d{7,}\b/,
];

export function containsBlockedContactInfo(input: string) {
  return blockedPatterns.some((pattern) => pattern.test(input));
}
