import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works on GitHub Pages or Cloudflare Pages
  // without knowing the final URL path.
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
