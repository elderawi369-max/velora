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

const sexualContentPatterns = [
  /\b(?:sex|sexy|sexual|sexting|nudes?|naked|nsfw|porn\w*|xxx|erotic\w*|horny|fetish\w*|bdsm|hookups?|hook\s*up|one\s*night\s*stand|fwb|friends\s+with\s+benefits|onlyfans|fansly|escort|slut\w*|whore\w*|blowjob|handjob|orgasm\w*|masturbat\w*|boobs?|tits|pussy|dicks?|cock|cum|anal|bondage|kinky|dominatrix|mistress|sugar\s*(?:daddy|baby|mommy)|lingerie|topless|strip\s*tease|fuck\w*)\b/i,
  /\b(?:send|share|show)\s+(?:me\s+)?(?:pics|pictures|photos)\b.*\b(?:body|naked|nude|sexy)\b/i,
];

export function containsSexualContent(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[@$]/g, (character) => (character === "@" ? "a" : "s"))
    .replace(/[01]/g, (digit) => (digit === "0" ? "o" : "i"))
    .replace(/(.)\1{2,}/g, "$1$1");
  return sexualContentPatterns.some((pattern) => pattern.test(input) || pattern.test(normalized));
}
