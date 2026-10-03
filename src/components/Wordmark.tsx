import { useI18n } from '../i18n/index.ts';
import { BrandGlyph } from './BrandGlyph.tsx';

/**
 * WORDMARK D'ACCUEIL HORS SESSION. Remplit le `h1` de l'en-tête : logo +
 * nom, pour que le premier titre accessible soit déjà la marque — pas un
 * libellé de navigation (« Mes espaces ») sans espaces à montrer.
 */
export function Wordmark() {
  const { t } = useI18n();
  return (
    <span className="settle-wordmark">
      <BrandGlyph size={32} />
      <span className="settle-wordmark-name">{t('app.name')}</span>
    </span>
  );
}
