/**
 * The embedding space as a search index, for "Ask" on the home page (src/ask): every
 * item's text, snippet and vector, and the PCA projection that placed it, so a question
 * can be embedded in the browser, matched and placed in the same space. Fetched only when
 * a visitor starts using Ask.
 */
import type { APIRoute } from 'astro';
import type { SearchIndex } from '../../ask/types';
import { getEmbeddingSpace } from '../../embedding';

export const GET: APIRoute = async () => {
  const space = await getEmbeddingSpace();
  const byId = new Map(space.items.map((item) => [item.id, item]));
  const round = (values: number[]) => values.map((x) => Math.round(x * 1e4) / 1e4);
  const index: SearchIndex = {
    source: space.source,
    model: space.model,
    items: space.items.map((item) => {
      const project = item.parent ? byId.get(item.parent) : undefined;
      return {
        kind: item.kind,
        label: item.label,
        snippet: item.snippet,
        text: item.text,
        ...(item.href || project?.href ? { href: item.href ?? project!.href } : {}),
        ...(project ? { context: project.label } : {}),
      };
    }),
    vectors: space.vectors.map(round),
    projection: { ...space.projection, mean: round(space.projection.mean), axes: space.projection.axes.map(round) },
  };
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
};
