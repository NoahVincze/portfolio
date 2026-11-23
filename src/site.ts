/**
 * Site-wide details. Everything marked PLACEHOLDER is sample copy to replace with your own.
 */
export const site = {
  name: 'Noah Vincze',
  /** PLACEHOLDER: one line under the name on the home page. */
  tagline: 'I design and build interactive things for the web.',
  /** PLACEHOLDER: used as the default meta description. */
  description: 'Portfolio of Noah Vincze: selected work, background and contact.',
  /** PLACEHOLDER: replace with the address you want visitors to use. */
  email: 'hello@example.com',
  socials: [
    { label: 'GitHub', href: 'https://github.com/NoahVincze' },
  ],
  nav: [
    { label: 'Work', href: '/work/' },
    { label: 'Lab', href: '/lab/' },
    { label: 'About', href: '/about/' },
    { label: 'Contact', href: '/contact/' },
  ],
} as const;
