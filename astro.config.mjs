// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * The site's public address, used for canonical URLs, the sitemap and social previews.
 * 1. SITE_URL, if set (e.g. in Vercel's environment variables).
 * 2. On Vercel: the project's production domain, which Vercel provides at build time
 *    (a custom domain once one is added, otherwise the .vercel.app address).
 * 3. Otherwise (local builds, CI): localhost.
 */
const site =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:4321');

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site,
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404/') })],
  vite: {
    build: {
      // The particle hero's chunk (Three.js, about 130 KB gzipped) is loaded lazily after the
      // page is idle, so its size does not affect first paint. Warn only above that.
      chunkSizeWarningLimit: 700,
    },
  },
});
