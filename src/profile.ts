/**
 * Background shown on the About page (and as the loss landscape's checkpoints), and
 * embedded with the projects for the embedding space (src/embedding). After changing it,
 * run `npm run embed` so the embedding space uses the real model.
 */

/** Experience, newest first. */
export const timeline = [
  { years: '2025 – now', title: 'Data Scientist, Bayer', text: 'ML & AI unit: data democratization through agentic enablement.' },
  {
    years: '2022 – 2025',
    title: 'B.Sc. Business Informatics, Bayer & FHDW',
    text: 'Integrated degree with rotations across Bayer, from data science and people analytics to cyber defence.',
  },
] as const;

/** Skills and tools. */
export const skills = [
  'Python',
  'Machine learning',
  'LLMs and agents',
  'PyTorch',
  'TypeScript',
  'React',
  'Dashboards',
  'Project management',
] as const;
