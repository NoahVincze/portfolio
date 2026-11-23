/**
 * Site-wide details.
 */
export const site = {
  name: 'Noah Vincze',
  /** One line under the name on the home page (also in link previews and scripts/og-image.html). */
  tagline: 'Data scientist building AI agents, ML systems and the evals that keep them honest.',
  /** The default meta description. */
  description: 'Noah Vincze is a data scientist working on AI agents, LLMs and machine learning. Selected work, background and contact.',
  /** The address on the Contact page. */
  email: 'noah-vincze@gmx.de',
  socials: [
    { label: 'GitHub', href: 'https://github.com/NoahVincze' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/noah-vincze/' },
  ],
  nav: [
    { label: 'Work', href: '/work/' },
    { label: 'Lab', href: '/lab/' },
    { label: 'About', href: '/about/' },
    { label: 'Contact', href: '/contact/' },
  ],
} as const;
