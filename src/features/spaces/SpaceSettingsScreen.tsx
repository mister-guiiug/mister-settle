import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { TextField } from '@mister-guiiug/dev-pwa-config/react/field';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useI18n } from '../../i18n/index.ts';
import type { Space } from '../../backend/ports.ts';
import { useSpaces } from './store.ts';
import { can, useCurrentSpace } from './useCurrentSpace.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { ColorPicker } from '../../components/ColorPicker.tsx';

/**
 * LES RÉGLAGES D'UN ESPACE. Chaque écriture porte la version lue : un
 * `conflict` dit que quelqu'un d'autre est passé, et propose de recharger —
 * jamais d'écrasement silencieux (ADR 0015).
 *
 * LE FORMULAIRE EST REMONTÉ À CHAQUE VERSION DE L'ESPACE (`key`) : ses champs
 * naissent des valeurs courantes, sans effet qui recopie des props dans un
 * état — le motif que la règle `set-state-in-effect` refuse, à raison.
 *
 * Archiver et supprimer sont réservés au propriétaire ; l'interface le dit
 * au lieu de cacher les boutons — et la base le refuse de toute façon.
 */
export function SpaceSettingsScreen() {
  const space = useCurrentSpace();
  if (!space) return null;
  return <SpaceSettings key={`${space.id}:${space.version}`} space={space} />;
}

function SpaceSettings({ space }: { space: Space }) {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const update = useSpaces(state => state.update);
  const archive = useSpaces(state => state.archive);
  const remove = useSpaces(state => state.remove);
  const error = useSpaces(state => state.error);
  const clearError = useSpaces(state => state.clearError);

  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description);
  const [icon, setIcon] = useState(space.icon);
  const [color, setColor] = useState(space.color);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rights = can(space.myRole);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    clearError();
    const saved = await update(
      space.id,
      {
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim(),
        color,
      },
      space.version
    );
    setBusy(false);
    if (saved) toast.success(t('spaceSettings.saved'));
  };

  const toggleArchive = async () => {
    setBusy(true);
    clearError();
    await archive(space.id, !space.archivedAt, space.version);
    setBusy(false);
  };

  const destroy = async () => {
    setConfirming(false);
    const done = await remove(space.id);
    if (done) void navigate('/', { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorBanner message={<ErrorMessage error={error} />} /> : null}

      <Card>
        <CardHeader
          title={t('spaceSettings.identity')}
          {...(rights.admin ? {} : { subtitle: t('spaceSettings.adminOnly') })}
        />
        <form
          onSubmit={event => void save(event)}
          className="flex flex-col gap-4"
        >
          <TextField
            label={t('newSpace.name')}
            value={name}
            maxLength={80}
            required
            disabled={!rights.admin}
            onChange={event => setName(event.target.value)}
          />
          <TextField
            label={t('newSpace.description')}
            value={description}
            maxLength={500}
            disabled={!rights.admin}
            onChange={event => setDescription(event.target.value)}
          />
          <TextField
            label={t('newSpace.icon')}
            hint={t('newSpace.iconHint')}
            value={icon}
            maxLength={8}
            disabled={!rights.admin}
            onChange={event => setIcon(event.target.value)}
          />
          <ColorPicker
            label={t('newSpace.color')}
            value={color}
            onChange={setColor}
          />
          <div>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              aria-disabled={!rights.admin}
            >
              {t('spaceSettings.save')}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={
            space.archivedAt
              ? t('spaceSettings.unarchive')
              : t('spaceSettings.archive')
          }
          subtitle={
            rights.own
              ? t('spaceSettings.archiveBody')
              : t('spaceSettings.ownerOnly')
          }
        />
        <Button
          variant="outline"
          onClick={() => void toggleArchive()}
          loading={busy}
          aria-disabled={!rights.own}
        >
          {space.archivedAt
            ? t('spaceSettings.unarchive')
            : t('spaceSettings.archive')}
        </Button>
      </Card>

      <Card>
        <CardHeader
          title={t('spaceSettings.danger')}
          {...(rights.own ? {} : { subtitle: t('spaceSettings.ownerOnly') })}
        />
        <Button
          variant="danger"
          onClick={() => setConfirming(true)}
          aria-disabled={!rights.own}
        >
          {t('spaceSettings.remove')}
        </Button>
      </Card>

      <ConfirmDialog
        open={confirming}
        destructive
        title={t('spaceSettings.removeConfirm', { name: space.name })}
        message={t('spaceSettings.removeBody')}
        onConfirm={() => void destroy()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
