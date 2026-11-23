/**
 * Ranking for Ask: semantic (cosine similarity between unit vectors) once the question
 * can be embedded, and BM25 keyword ranking before that (and as the fallback), so the
 * first answer never waits for the model to download.
 */

export interface Hit {
  /** Index into the search index's items (= the embedding space's points). */
  index: number;
  score: number;
}

const STOP_WORDS = new Set(
  'a an and are as at be by can did do does for from has have how i in is it its me my of on or so that the this to was what when where which who why will with you your'.split(' '),
);

/** A light stemmer, enough for "studies" to meet "study" and "pipelines" to meet "pipeline". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export const words = (text: string) =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP_WORDS.has(w)).map(stem);

/** BM25 (k1 = 1.2, b = 0.75) over the items' texts. */
export function keywordIndex(texts: string[]): (query: string) => Hit[] {
  const docs = texts.map((text) => {
    const counts = new Map<string, number>();
    for (const word of words(text)) counts.set(word, (counts.get(word) ?? 0) + 1);
    return { counts, length: [...counts.values()].reduce((a, b) => a + b, 0) };
  });
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(docs.length, 1);
  const frequency = new Map<string, number>();
  for (const doc of docs) for (const word of doc.counts.keys()) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const idf = (word: string) => {
    const n = frequency.get(word) ?? 0;
    return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
  };
  return (query) => {
    const terms = [...new Set(words(query))];
    return docs
      .map((doc, index) => {
        let score = 0;
        for (const term of terms) {
          // Prefix matches count too ("pipeline" finds "pipelines"), at half weight.
          let tf = doc.counts.get(term) ?? 0;
          if (!tf && term.length >= 4) for (const [word, n] of doc.counts) if (word.startsWith(term) || term.startsWith(word)) tf += n * 0.5;
          if (tf) score += (idf(term) * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * doc.length) / average));
        }
        return { index, score };
      })
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score);
  };
}

/** Items by cosine similarity to `query` (all vectors are unit length, so it is the dot product). */
export function semanticRank(query: number[], vectors: number[][]): Hit[] {
  return vectors
    .map((vector, index) => ({ index, score: vector.reduce((sum, v, i) => sum + v * query[i]!, 0) }))
    .sort((a, b) => b.score - a.score);
}

/** Keeps the best hit per distinct text (placeholder content repeats itself), up to `count`. */
export function distinctTop(hits: Hit[], texts: string[], count: number): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const hit of hits) {
    const key = texts[hit.index]!;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length === count) break;
  }
  return out;
}
