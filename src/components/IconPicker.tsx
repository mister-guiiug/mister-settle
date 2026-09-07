import { useId } from 'react';
import { useI18n } from '../i18n/index.ts';

/**
 * DOUZE ICÔNES, ET RIEN À TAPER.
 *
 * Le champ était libre : il fallait connaître le raccourci de son système
 * pour poser un émoji, et une icône se choisit plus vite qu'elle ne s'écrit.
 * Douze suffisent pour ce que les gens partagent — un voyage, une colocation,
 * une table, des courses, une fête.
 *
 * CE QUI EST STOCKÉ NE CHANGE PAS : la base garde `icon` en texte, huit
 * signes au plus (migration 0006), et l'écran d'accueil l'affiche tel quel
 * sur la pastille de l'espace. Aucune correspondance à maintenir, aucune
 * police à charger, et une icône inconnue de cette liste — écrite avant, ou
 * par une autre version — reste choisie : elle rejoint la grille en tête.
 */
const PRESETS: readonly { key: string; icon: string }[] = [
  { key: 'home', icon: '🏠' },
  { key: 'plane', icon: '✈️' },
  { key: 'beach', icon: '🏖️' },
  { key: 'mountain', icon: '⛰️' },
  { key: 'meal', icon: '🍽️' },
  { key: 'cart', icon: '🛒' },
  { key: 'party', icon: '🎉' },
  { key: 'car', icon: '🚗' },
  { key: 'camp', icon: '⛺' },
  { key: 'sport', icon: '⚽' },
  { key: 'study', icon: '🎓' },
  { key: 'gift', icon: '🎁' },
];

interface IconPickerProps {
  label: string;
  value: string;
  /** La couleur choisie pour l'espace : la grille montre le résultat. */
  color: string;
  /** Un membre qui n'administre pas voit le choix, sans pouvoir le changer. */
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function IconPicker({
  label,
  value,
  color,
  disabled = false,
  onChange,
}: IconPickerProps) {
  const { t } = useI18n();
  const name = useId();
  const known = PRESETS.some(preset => preset.icon === value);
  const options = [
    ...(value && !known ? [{ key: 'custom', icon: value }] : []),
    ...PRESETS,
  ];
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <label
          className={`settle-puce flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          style={{
            background: 'var(--dwc-surface-2)',
            borderColor: value === '' ? 'var(--dwc-text)' : 'transparent',
            color: 'var(--dwc-text-soft)',
          }}
        >
          <input
            type="radio"
            name={name}
            value=""
            checked={value === ''}
            onChange={() => onChange('')}
            className="sr-only"
            disabled={disabled}
            aria-label={t('newSpace.iconNone')}
          />
          <span aria-hidden="true">—</span>
        </label>
        {options.map(preset => (
          <label
            key={preset.key}
            className={`settle-puce flex h-10 w-10 items-center justify-center rounded-full border-2 text-xl ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            style={{
              background: color || 'var(--dwc-surface-2)',
              borderColor:
                value === preset.icon ? 'var(--dwc-text)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name={name}
              value={preset.icon}
              checked={value === preset.icon}
              onChange={() => onChange(preset.icon)}
              className="sr-only"
              disabled={disabled}
              aria-label={
                preset.key === 'custom'
                  ? preset.icon
                  : t(`icons.${preset.key}` as 'icons.home')
              }
            />
            <span aria-hidden="true">{preset.icon}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
