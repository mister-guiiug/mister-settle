/**
 * LE GLYPHE SEUL — sans lien, sans légende. Source unique : `public/favicon.svg`.
 * Servi par le wordmark d'accueil, l'héros « À propos » et les états vides.
 */
export function BrandGlyph({
  size = 28,
  className = 'settle-brand-mark',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}favicon.svg`}
      width={size}
      height={size}
      alt=""
    />
  );
}
