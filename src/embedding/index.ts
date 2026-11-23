/**
 * The site's embedding space, built once per build from the projects collection and
 * src/profile.ts, using the vectors cached by `npm run embed` (see ./space.ts).
 */
import { getProjects } from '../projects';
import { skills, timeline } from '../profile';
import { buildCorpus } from './corpus';
import { buildSpace, type EmbeddingCache, type EmbeddingSpace } from './space';

const cacheFiles = import.meta.glob<EmbeddingCache>('../data/embeddings.json', { eager: true, import: 'default' });

let space: Promise<EmbeddingSpace> | null = null;

export function getEmbeddingSpace(): Promise<EmbeddingSpace> {
  space ??= (async () => {
    const projects = (await getProjects()).map((project) => ({
      id: project.id,
      title: project.data.title,
      summary: project.data.summary,
      tags: project.data.tags,
      body: project.body ?? '',
    }));
    const items = buildCorpus(projects, { skills, timeline });
    const result = buildSpace(items, Object.values(cacheFiles)[0] ?? null);
    if (result.missing > 0) {
      console.warn(
        `[embedding] ${result.missing} of ${items.length} items have no cached vector, so the embedding space uses ` +
          'the hashed fallback. Run `npm run embed` and commit src/data/embeddings.json.',
      );
    }
    return result;
  })();
  return space;
}

export type { EmbeddingSpace, SpacePoint } from './space';
