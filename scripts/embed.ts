/**
 * npm run embed: embeds everything in the corpus (src/embedding/corpus.ts) with
 * all-MiniLM-L6-v2 and writes the vectors to src/data/embeddings.json, which the site
 * build reads. Run it after adding or changing projects or src/profile.ts, and commit
 * the JSON. The build itself never downloads the model (see src/embedding/space.ts).
 *
 * Node runs this TypeScript file directly (type stripping, Node 22.18+).
 *
 * transformers.js is deliberately not a project dependency, so Vercel and CI never install
 * it (or its ONNX runtime): the npm script installs it on the spot with --no-save, and a
 * later `npm ci` removes it again. The model (about 90 MB) is cached in
 * ~/.cache/portfolio-embed, outside node_modules, so it downloads only once per machine.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildCorpus, textKey, type CorpusProject } from '../src/embedding/corpus.ts';
import { buildSpace, DIMENSIONS, MODEL, type EmbeddingCache } from '../src/embedding/space.ts';
import { skills, timeline } from '../src/profile.ts';

const PROJECTS_DIR = 'src/content/projects';
const CACHE_FILE = 'src/data/embeddings.json';

/** The few front-matter fields the corpus needs (strings and [a, b] lists). */
function readProject(id: string, source: string): CorpusProject {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const fields: Record<string, string> = {};
  for (const line of (match?.[1] ?? '').split(/\r?\n/)) {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (field) fields[field[1]!] = field[2]!.trim();
  }
  const unquote = (value = '') => value.replace(/^(['"])(.*)\1$/, '$2');
  const tags = (fields.tags ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((tag) => unquote(tag.trim()))
    .filter(Boolean);
  return { id, title: unquote(fields.title), summary: unquote(fields.summary), tags, body: match?.[2] ?? source };
}

const files = (await readdir(PROJECTS_DIR)).filter((file) => file.endsWith('.md')).sort();
const projects = await Promise.all(
  files.map(async (file) => readProject(file.replace(/\.md$/, ''), await readFile(join(PROJECTS_DIR, file), 'utf8'))),
);
const items = buildCorpus(projects, { skills, timeline });
const texts = [...new Set(items.map((item) => item.text))];
console.log(`Embedding ${texts.length} texts (${items.length} items) with ${MODEL}...`);

/** The slice of transformers.js used here (it is not installed for type-checking). */
interface Transformers {
  env: { cacheDir: string };
  pipeline(
    task: 'feature-extraction',
    model: string,
    options: { dtype: 'fp32' },
  ): Promise<(texts: string[], options: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>>;
}

const TRANSFORMERS = '@huggingface/transformers';
let transformers: Transformers;
try {
  transformers = (await import(TRANSFORMERS)) as Transformers;
} catch {
  console.error(`${TRANSFORMERS} is not installed. Run this through \`npm run embed\`, which installs it first.`);
  process.exit(1);
}
transformers.env.cacheDir = join(homedir(), '.cache', 'portfolio-embed');

const extract = await transformers.pipeline('feature-extraction', MODEL, { dtype: 'fp32' });
const output = await extract(texts, { pooling: 'mean', normalize: true });
const rows = output.tolist();

const vectors: Record<string, number[]> = {};
texts.forEach((text, i) => {
  if (rows[i]!.length !== DIMENSIONS) throw new Error(`Expected ${DIMENSIONS} dimensions, got ${rows[i]!.length}`);
  vectors[textKey(text)] = rows[i]!.map((x) => Math.round(x * 1e6) / 1e6);
});
const cache: EmbeddingCache = {
  model: MODEL,
  dims: DIMENSIONS,
  vectors: Object.fromEntries(Object.entries(vectors).sort(([a], [b]) => a.localeCompare(b))),
};
await writeFile(CACHE_FILE, `${JSON.stringify(cache)}\n`);

const space = buildSpace(items, cache);
console.log(`Wrote ${CACHE_FILE}: ${Object.keys(vectors).length} vectors. Space source: ${space.source}.`);
for (const point of space.points.filter((p) => p.label)) {
  console.log(`  ${point.kind.padEnd(10)} ${point.label.padEnd(24)} ${point.position.map((x) => x.toFixed(2).padStart(5)).join(' ')}`);
}
