/**
 * Ask (home page, in the embedding space): a visitor's question is matched against
 * everything on the site, and the closest items are listed and lit up in the space.
 *
 * - The search index (/embedding/search.json) is fetched when the section comes into view.
 * - The encoder (src/ask/encoder.ts, ~23 MB) starts loading when the visitor focuses the
 *   box, unless they have asked the browser to save data, in which case it loads on the
 *   first question. The question is embedded in the browser and never leaves it.
 * - Until the encoder is ready, questions are answered by keyword search (BM25), so the
 *   first answer is instant; once it is, the shown question is re-ranked by meaning.
 * - Each answer is announced with a `space:query` event (null to clear): the particle hero
 *   flies the question into its place in the space and lights up its nearest neighbours.
 *   Labels of matching items get `.is-hit` either way.
 */
import { loadEncoder, type Encoder } from '../../ask/encoder';
import { distinctTop, keywordIndex, semanticRank, type Hit } from '../../ask/search';
import type { SearchIndex } from '../../ask/types';
import { hashedEmbedding, project } from '../../embedding/space';
import { definePageEffect } from '../page';

export interface SpaceQueryDetail {
  /** Where the question sits in the space (display units). */
  position: [number, number, number];
  /** Indices of the closest points, best first. */
  hits: number[];
}

declare global {
  interface WindowEventMap {
    'space:query': CustomEvent<SpaceQueryDetail | null>;
  }
}

const RESULTS = 4;
const MODEL_SIZE = '23 MB';
const STATUS = {
  idle: 'Your question is embedded in your browser and never leaves it.',
  ready: 'Encoder ready: questions are matched by meaning, in your browser.',
  failed: 'The encoder could not load, so questions are matched by keywords.',
  hashed: 'Questions are matched with the same hashed embedding as the site.',
};

let indexRequest: Promise<SearchIndex> | null = null;
const fetchIndex = (url: string) => {
  indexRequest ??= fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Search index: ${response.status}`);
    return response.json() as Promise<SearchIndex>;
  });
  indexRequest.catch(() => {
    indexRequest = null;
  });
  return indexRequest;
};

definePageEffect(() => {
  const form = document.querySelector<HTMLFormElement>('[data-ask]');
  const input = form?.querySelector<HTMLInputElement>('[data-ask-input]');
  const status = form?.querySelector<HTMLElement>('[data-ask-status]');
  const results = document.querySelector<HTMLElement>('[data-ask-results]');
  const list = results?.querySelector<HTMLElement>('[data-ask-list]');
  const mode = results?.querySelector<HTMLElement>('[data-ask-mode]');
  if (!form || !input || !status || !results || !list || !mode) return;
  const url = form.dataset.index ?? '/embedding/search.json';
  const labels = [...document.querySelectorAll<HTMLElement>('[data-space-point]')];

  let encoder: Encoder | null = null;
  let encoderFailed = false;
  let keyword: ((query: string) => Hit[]) | null = null;
  let shown = '';
  let alive = true;
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

  async function index(): Promise<SearchIndex> {
    const data = await fetchIndex(url);
    keyword ??= keywordIndex(data.items.map((item) => item.text));
    return data;
  }

  function startEncoder(data: SearchIndex): void {
    if (encoder || encoderFailed || data.source !== 'model') return;
    status!.textContent = `Loading the encoder (${data.model.split('/').pop()}, ${MODEL_SIZE})…`;
    loadEncoder(data.model, (share) => {
      if (alive && !encoder) status!.textContent = `Loading the encoder: ${Math.round(share * 100)}% of ${MODEL_SIZE}`;
    })
      .then((loaded) => {
        if (!alive) return;
        encoder = loaded;
        status!.textContent = STATUS.ready;
        // Re-rank the question on screen by meaning.
        if (shown) void ask(shown);
      })
      .catch(() => {
        encoderFailed = true;
        if (!alive) return;
        status!.textContent = STATUS.failed;
        if (shown) void ask(shown); // drop "while the encoder loads" from the results
      });
  }

  const prepare = () => {
    index()
      .then((data) => {
        if (data.source === 'hashed') status.textContent = STATUS.hashed;
        else if (!saveData) startEncoder(data);
      })
      .catch(() => undefined);
  };

  function render(data: SearchIndex, hits: Hit[], how: 'meaning' | 'keywords' | 'hashed'): void {
    results!.hidden = false;
    mode!.textContent =
      how === 'meaning'
        ? 'Closest by meaning (cosine similarity)'
        : how === 'hashed'
          ? 'Closest (hashed embedding, cosine similarity)'
          : hits.length
            ? `Keyword matches (BM25)${encoder || encoderFailed ? '' : ', while the encoder loads'}`
            : 'No keyword matches. The encoder will match by meaning once it has loaded.';
    const top = hits[0]?.score ?? 1;
    list!.replaceChildren(
      ...hits.map((hit, rank) => {
        const item = data.items[hit.index]!;
        const li = document.createElement('li');
        const number = document.createElement('span');
        number.className = 'ask__rank';
        number.textContent = String(rank + 1).padStart(2, '0');
        const label = document.createElement(item.href ? 'a' : 'span');
        label.className = 'ask__label';
        label.textContent = item.label || `${item.context ?? 'Project'}, a passage`;
        if (item.href) label.setAttribute('href', item.href);
        const score = document.createElement('span');
        score.className = 'ask__score';
        score.textContent = how === 'keywords' ? `${Math.round((hit.score / top) * 100)}%` : hit.score.toFixed(2);
        score.title = how === 'keywords' ? 'BM25 score, relative to the best match' : 'Cosine similarity';
        const snippet = document.createElement('span');
        snippet.className = 'ask__snippet';
        snippet.textContent = item.snippet;
        li.append(number, label, score, snippet);
        return li;
      }),
    );
  }

  function highlight(hits: Hit[]): void {
    const set = new Set(hits.map((hit) => hit.index));
    for (const label of labels) label.classList.toggle('is-hit', set.has(Number(label.dataset.spacePoint)));
  }

  /** Where a keyword answer sits: the score-weighted mean of its hits' places. */
  function placeOf(data: SearchIndex, hits: Hit[]): [number, number, number] {
    const total = hits.reduce((sum, hit) => sum + hit.score, 0) || 1;
    const at = [0, 0, 0];
    for (const hit of hits) {
      const p = project(data.vectors[hit.index]!, data.projection);
      for (let c = 0; c < 3; c++) at[c]! += ((p[c] ?? 0) * hit.score) / total;
    }
    return at as [number, number, number];
  }

  async function ask(question: string): Promise<void> {
    shown = question;
    const data = await index();
    if (!alive || shown !== question) return;
    const texts = data.items.map((item) => item.text);
    let hits: Hit[];
    let position: [number, number, number];
    let how: 'meaning' | 'keywords' | 'hashed';
    if (data.source === 'hashed') {
      const vector = hashedEmbedding(question);
      hits = distinctTop(semanticRank(vector, data.vectors), texts, RESULTS);
      position = project(vector, data.projection) as [number, number, number];
      how = 'hashed';
    } else if (encoder) {
      const vector = await encoder(question);
      if (!alive || shown !== question) return;
      hits = distinctTop(semanticRank(vector, data.vectors), texts, RESULTS);
      position = project(vector, data.projection) as [number, number, number];
      how = 'meaning';
    } else {
      startEncoder(data); // with save-data on, the first question is the cue to load it
      hits = distinctTop(keyword!(question), texts, RESULTS);
      position = placeOf(data, hits);
      how = 'keywords';
    }
    render(data, hits, how);
    highlight(hits);
    window.dispatchEvent(
      new CustomEvent<SpaceQueryDetail | null>('space:query', { detail: hits.length ? { position, hits: hits.map((h) => h.index) } : null }),
    );
  }

  function clear(): void {
    shown = '';
    results!.hidden = true;
    list!.replaceChildren();
    highlight([]);
    window.dispatchEvent(new CustomEvent<SpaceQueryDetail | null>('space:query', { detail: null }));
  }

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const question = input.value.trim();
    if (question) void ask(question).catch(() => (status.textContent = STATUS.failed));
    else clear();
  };
  const onInput = () => {
    if (!input.value.trim()) clear();
  };
  form.addEventListener('submit', onSubmit);
  input.addEventListener('input', onInput);
  input.addEventListener('focus', prepare);

  // Fetch the (small) index once the section is in view; the model waits for focus.
  const section = form.closest('section') ?? form;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      index().catch(() => undefined);
    }
  });
  observer.observe(section);

  return () => {
    alive = false;
    observer.disconnect();
    form.removeEventListener('submit', onSubmit);
    input.removeEventListener('input', onInput);
    input.removeEventListener('focus', prepare);
    highlight([]);
    window.dispatchEvent(new CustomEvent<SpaceQueryDetail | null>('space:query', { detail: null }));
  };
});
