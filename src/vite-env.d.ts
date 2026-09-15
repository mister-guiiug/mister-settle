/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="@mister-guiiug/dev-pwa-config/vite-version" />

interface ImportMetaEnv {
  /**
   * Identifiant de mesure GA4 (`G-…`), propre à CETTE application. Absent, le
   * bandeau de consentement ne rend rien et rien n'est mesuré : c'est le seul
   * interrupteur, et une propriété par site est ce qui rend le suivi
   * indépendant.
   */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
