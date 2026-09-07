import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import {
  SelectField,
  TextField,
} from '@mister-guiiug/dev-pwa-config/react/field';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { useI18n } from '../../i18n/index.ts';
import { useSpaces } from './store.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { CURRENCIES, currencyLabel } from '../../domain/currencies.ts';
import { ColorPicker } from '../../components/ColorPicker.tsx';

/**
 * Créer un espace : un nom, une devise, et c'est tout ce qui est obligatoire.
 * La devise se choisit UNE fois : elle borne les décimales de tous les
 * montants de l'espace (ADR 0011).
 */
export function NewSpaceScreen() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const create = useSpaces(state => state.create);
  const error = useSpaces(state => state.error);
  const clearError = useSpaces(state => state.clearError);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [meName, setMeName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t('newSpace.nameRequired'));
      return;
    }
    setNameError(null);
    setBusy(true);
    clearError();
    const space = await create({
      name: name.trim(),
      description: description.trim(),
      currency,
      icon: icon.trim(),
      color,
      ...(meName.trim() ? { meName: meName.trim() } : {}),
    });
    setBusy(false);
    if (space) void navigate(`/e/${space.id}`, { replace: true });
  };

  return (
    <Card>
      <form
        onSubmit={event => void submit(event)}
        className="flex flex-col gap-4"
      >
        <TextField
          label={t('newSpace.name')}
          placeholder={t('newSpace.namePlaceholder')}
          value={name}
          maxLength={80}
          required
          onChange={event => setName(event.target.value)}
          {...(nameError ? { error: nameError } : {})}
        />
        <TextField
          label={t('newSpace.description')}
          placeholder={t('newSpace.descriptionPlaceholder')}
          value={description}
          maxLength={500}
          onChange={event => setDescription(event.target.value)}
        />
        <SelectField
          label={t('newSpace.currency')}
          value={currency}
          onChange={event => setCurrency(event.target.value)}
        >
          {CURRENCIES.map(code => (
            <option key={code} value={code}>
              {currencyLabel(code, locale)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('newSpace.icon')}
          hint={t('newSpace.iconHint')}
          value={icon}
          maxLength={8}
          onChange={event => setIcon(event.target.value)}
        />
        <ColorPicker
          label={t('newSpace.color')}
          value={color}
          onChange={setColor}
        />
        <TextField
          label={t('newSpace.meName')}
          hint={t('newSpace.meNameHint')}
          value={meName}
          maxLength={60}
          onChange={event => setMeName(event.target.value)}
        />

        {error ? (
          <ErrorBanner message={<ErrorMessage error={error} />} />
        ) : null}

        <div>
          <Button type="submit" variant="primary" loading={busy}>
            {t('newSpace.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
