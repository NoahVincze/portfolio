import type { APIRoute } from 'astro';

/** Allows everything and points crawlers at the sitemap. Vercel keeps preview deployments out of search on its own. */
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
