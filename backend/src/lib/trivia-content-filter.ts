const unsuitablePattern = new RegExp(
  "\\b(?:sex|sexy|sexier|sexiest|sexual\\w*|sexting|nude\\w*|naked|nsfw|porn\\w*|playboy|penthouse|erotic\\w*|lingerie|topless|bikini|thong|underwear|breasts?|boobs?|nipples?|genital\\w*|penis|vagina|strip(?:per|pers|tease|\\s+club)|prostitut\\w*|brothel|pimp|hookers?|gigolo|orgy|orgasm\\w*|masturbat\\w*|fetish\\w*|bdsm|condoms?|viagra|rape[ds]?|raping|rapist|incest|molest\\w*|seduc\\w*|affair|adulter\\w*|lust|aphrodisiac|pussy|cock|dick|kamasutra|kama\\s+sutra)\\b",
  "i",
);

export function isUnsuitableTriviaText(...parts: string[]) {
  return parts.some((part) => unsuitablePattern.test(part));
}

export function isSuitableTriviaQuestion(question: { prompt: string; options: string[] }) {
  return !isUnsuitableTriviaText(question.prompt, ...question.options);
}
