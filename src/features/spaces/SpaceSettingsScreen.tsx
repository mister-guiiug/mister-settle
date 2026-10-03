import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { IconPicker } from '../../components/IconPicker.tsx';
import { CategoriesCard } from '../expenses/CategoriesCard.tsx';

/**
 * LES RÉGLAGES D'UN ESPACE — trois blocs métier :
 * Configurer (identité + devise lecture + catégories), Partager (invitations),
 * Cycle de vie (archiver + supprimer). Pas de raccourci Stats : déjà dans
 * la bottom-nav « Plus ».
 *
 * Chaque écriture porte la version lue : un `conflict` dit que quelqu'un
 * d'autre est passé, et propose de recharger — jamais d'écrasement silencieux
 * (ADR 0015).
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
    if (!name.trim() || !rights.admin) return;
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
    if (!rights.own) return;
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
          title={t('spaceSettings.configure')}
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
          <p className="m-0 text-sm" style={{ color: 'var(--dwc-text-soft)' }}>
            {t('spaceSettings.currency', { currency: space.currency })}
          </p>
          <IconPicker
            label={t('newSpace.icon')}
            value={icon}
            color={color}
            disabled={!rights.admin}
            onChange={setIcon}
          />
          <ColorPicker
            label={t('newSpace.color')}
            value={color}
            disabled={!rights.admin}
            onChange={setColor}
          />
          <div>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={!rights.admin}
            >
              {t('spaceSettings.save')}
            </Button>
          </div>
        </form>
      </Card>

      <CategoriesCard
        space={space}
        editable={rights.admin && !space.archivedAt}
      />

      {rights.admin ? (
        <Card>
          <CardHeader
            title={t('spaceSettings.share')}
            subtitle={t('invitations.inviteHint')}
          />
          <Link to={`/e/${space.id}/invitations`} className="no-underline">
            <Button variant="outline">{t('invitations.title')}</Button>
          </Link>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={t('spaceSettings.lifecycle')}
          subtitle={
            rights.own
              ? t('spaceSettings.archiveBody')
              : t('spaceSettings.ownerOnly')
          }
        />
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={() => void toggleArchive()}
            loading={busy}
            disabled={!rights.own}
          >
            {space.archivedAt
              ? t('spaceSettings.unarchive')
              : t('spaceSettings.archive')}
          </Button>
          <hr className="settle-settings-rule m-0" />
          <div className="flex flex-col gap-2">
            <p
              className="m-0 text-sm font-medium"
              style={{ color: 'var(--dwc-danger)' }}
            >
              {t('spaceSettings.danger')}
            </p>
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              disabled={!rights.own}
            >
              {t('spaceSettings.remove')}
            </Button>
          </div>
        </div>
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
