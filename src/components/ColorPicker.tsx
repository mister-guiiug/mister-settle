import { useId } from 'react';

/** Une palette courte, lisible sur fond clair et sombre. */
const PALETTE: readonly string[] = [
  '#3b6ea5',
  '#2f6f4f',
  '#b3652e',
  '#8a4fa0',
  '#b3262e',
  '#3a7f8a',
];

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Un groupe de boutons radio — le rôle natif, pas un `div` qui se prend pour
 * une case : le clavier et les lecteurs d'écran le connaissent déjà. La
 * première option est « aucune couleur ».
 */
export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const name = useId();
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {['', ...PALETTE].map(color => (
          <label
            key={color || 'none'}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2"
            style={{
              background: color || 'var(--dwc-surface-2)',
              borderColor: value === color ? 'var(--dwc-text)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className="sr-only"
              aria-label={color || '—'}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
