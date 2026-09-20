import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { baseTestOptions } from '@mister-guiiug/dev-pwa-config/vitest-base';

const pwaRegisterDouble = fileURLToPath(
  import.meta.resolve('@mister-guiiug/dev-pwa-config/testing/pwa-register')
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // vite-plugin-pwa injecte ce module virtuel au dev et au build. Vitest ne
      // passe pas par le greffon : sans alias, TOUT test qui tire `App.tsx`
      // échoue À LA RÉSOLUTION, avant d'avoir rien éprouvé — et c'est pourquoi
      // la coquille de l'app n'avait aucun test. Un `vi.mock` ne suffit pas :
      // il n'agit qu'à l'exécution, la résolution a déjà échoué.
      //
      // La cible est le double du socle, le même que celui de mister-molkky.
      'virtual:pwa-register': pwaRegisterDouble,
    },
  },
  test: {
    ...baseTestOptions,
    // Les specs Playwright vivent dans `e2e/` : Vitest ne doit pas y piocher.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
