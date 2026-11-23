import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** One Markdown file per project in src/content/projects. The file name becomes the URL. */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    /** One sentence, shown on cards and as the page description. */
    summary: z.string(),
    year: z.number().int(),
    role: z.string(),
    tags: z.array(z.string()).default([]),
    /** Featured projects appear in "Selected work" on the home page. */
    featured: z.boolean().default(false),
    /** Lower numbers come first. */
    order: z.number().default(100),
    /** Cover colour, shown while the cover image loads (and used by the particle hero). */
    accent: z.string().default('#d8d2c4'),
    /** Cover image path in public/ (e.g. /covers/my-project.jpg). 4:3 or wider works best. */
    cover: z.string().optional(),
    /** Optional link to the live project. */
    link: z.url().optional(),
    /** Optional link to the source code (e.g. the GitHub repository). */
    repo: z.url().optional(),
  }),
});

export const collections = { projects };
