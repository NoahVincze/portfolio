/**
 * A tiny, deterministic stand-in for a BPE tokenizer, used by the token-streaming text
 * reveal (effects/stream.ts). It is not a real vocabulary; it only has to split text the
 * way language-model tokens look: words carry their leading space ("▁design"), short words
 * are one token, longer ones break into a stem and a common suffix ("▁interact" + "ive"),
 * and punctuation stands alone.
 */

const SUFFIXES = [
  'ations', 'ation', 'tion', 'sion', 'ment', 'ness', 'ings', 'ing', 'able', 'ible', 'ally',
  'less', 'ful', 'ous', 'ive', 'ize', 'ise', 'ity', 'est', 'ers', 'er', 'ed', 'ly', 'al', 's',
];

const MAX_WHOLE = 6;
const MIN_STEM = 3;

/** Splits one word (with any leading whitespace) into tokens. */
function splitWord(token: string): string[] {
  const space = token.length - token.trimStart().length;
  const word = token.slice(space);
  if (word.length <= MAX_WHOLE) return [token];
  const lower = word.toLowerCase();
  const suffix = SUFFIXES.find((s) => lower.endsWith(s) && word.length - s.length >= MIN_STEM);
  const cut = suffix ? word.length - suffix.length : Math.ceil(word.length / 2);
  // A long stem splits again, the way rare words become several tokens.
  return [...splitWord(token.slice(0, space + cut)), word.slice(cut)];
}

/** Text as tokens; joining them gives back the text exactly. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const [part] of text.matchAll(/\s*[\p{L}\p{N}’']+|\s*[^\s\p{L}\p{N}’']|\s+/gu)) {
    if (!part.trim()) tokens.push(part);
    else tokens.push(...splitWord(part));
  }
  return tokens;
}

/** A token as tokenizers print it: a leading space shown as ▁ (SentencePiece style). */
export const displayToken = (token: string) => token.replace(/^\s+/, '▁');
