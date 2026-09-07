import { initialsOf, pickColor } from '../domain/people.ts';

/**
 * LES INITIALES DANS UN ROND : l'identité visuelle d'une personne, partout
 * la même. Les initiales et la couleur enregistrées priment ; sinon elles se
 * déduisent du nom, de façon stable. Décoratif — le nom est écrit à côté.
 */
export function Avatar({
  name,
  initials = '',
  color = '',
  size = 'md',
}: {
  name: string;
  initials?: string;
  color?: string;
  size?: 'sm' | 'md';
}) {
  const dimensions = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';
  return (
    <span
      aria-hidden="true"
      className={`flex ${dimensions} shrink-0 select-none items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: color || pickColor(name) }}
    >
      {initials || initialsOf(name)}
    </span>
  );
}
