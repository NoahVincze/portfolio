// @ts-check
import { defineConfig } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  // Set this to the production URL once hosting is chosen (used for canonical URLs and sitemaps).
  // site: 'https://example.com',
  vite: {
    build: {
      // The particle hero's chunk (Three.js, about 130 KB gzipped) is loaded lazily after the
      // page is idle, so its size does not affect first paint. Warn only above that.
      chunkSizeWarningLimit: 700,
    },
  },
});
