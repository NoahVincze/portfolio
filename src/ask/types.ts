/** The search index served at /embedding/search.json (src/pages/embedding/search.json.ts). */
import type { Projection } from '../embedding/space';

export interface SearchItem {
  kind: 'project' | 'passage' | 'skill' | 'experience';
  label: string;
  snippet: string;
  /** What was embedded (also what keyword search matches). */
  text: string;
  /** Where the result links: the project itself, or a passage's project. */
  href?: string;
  /** Passages: their project's title. */
  context?: string;
}

export interface SearchIndex {
  /** 'model': vectors from `model`, so questions are embedded with it too. 'hashed': the fallback. */
  source: 'model' | 'hashed';
  model: string;
  items: SearchItem[];
  /** One unit vector per item, in the order of `items` (= the embedding space's points). */
  vectors: number[][];
  projection: Projection;
}
