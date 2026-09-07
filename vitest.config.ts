import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { baseTestOptions } from '@mister-guiiug/dev-pwa-config/vitest-base';

export default defineConfig({
  plugins: [react()],
  test: {
    ...baseTestOptions,
    // Les specs Playwright vivent dans `e2e/` : Vitest ne doit pas y piocher.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
