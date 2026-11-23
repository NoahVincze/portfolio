/**
 * The corpus for the embedding space: everything on the site worth embedding, as items
 * with the text that represents them.
 *
 *   project     title, summary, tags and write-up of each project (labelled, links to it)
 *   passage     each paragraph of a project's write-up, on its own (small, unlabelled)
 *   skill       each skill from src/profile.ts (labelled)
 *   experience  each timeline entry from src/profile.ts (labelled)
 *
 * Pure TypeScript with no Astro imports, so both the site build (src/embedding/index.ts)
 * and the embedding script (scripts/embed.ts, run directly by Node) can use it.
 */

export type ItemKind = 'project' | 'passage' | 'skill' | 'experience';

export interface CorpusProject {
  id: string;
  title: string;
  summary: string;
  tags: readonly string[];
  /** The write-up, as Markdown. */
  body: string;
}

export interface CorpusProfile {
  skills: readonly string[];
  timeline: readonly { years: string; title: string; text: string }[];
}

export interface CorpusItem {
  id: string;
  kind: ItemKind;
  /** Shown next to the point (empty for passages). */
  label: string;
  /** What gets embedded. */
  text: string;
  /** A short excerpt to show when the item comes up in a search. */
  snippet: string;
  /** Passages: the id of their project. */
  parent?: string;
  /** Projects: their page. */
  href?: string;
  tags?: readonly string[];
}

/** Markdown reduced to plain prose: no headings markers, links, emphasis or code fences. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The paragraphs of a write-up that are long enough to stand on their own. */
function paragraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .filter((block) => !/^\s*#/.test(block))
    .map(plainText)
    .filter((text) => text.length >= 40);
}

export function buildCorpus(projects: readonly CorpusProject[], profile: CorpusProfile): CorpusItem[] {
  const items: CorpusItem[] = [];
  for (const project of projects) {
    items.push({
      id: `project:${project.id}`,
      kind: 'project',
      label: project.title,
      text: [project.title, project.summary, project.tags.join(', '), plainText(project.body)]
        .map((part) => part.trim().replace(/[.!?]$/, ''))
        .filter(Boolean)
        .join('. '),
      href: `/work/${project.id}/`,
      tags: project.tags,
      snippet: project.summary,
    });
    paragraphs(project.body).forEach((text, i) => {
      items.push({ id: `passage:${project.id}:${i}`, kind: 'passage', label: '', text, snippet: text, parent: `project:${project.id}` });
    });
  }
  for (const skill of profile.skills) {
    items.push({ id: `skill:${slug(skill)}`, kind: 'skill', label: skill, text: skill, snippet: 'Skills and tools' });
  }
  profile.timeline.forEach((entry, i) => {
    items.push({
      id: `experience:${i}`,
      kind: 'experience',
      label: entry.title,
      text: `${entry.title}. ${entry.text}`,
      snippet: `${entry.years}. ${entry.text}`,
    });
  });
  return items;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A stable key for a piece of text (FNV-1a, 64-bit as two halves), used to cache its vector. */
export function textKey(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
