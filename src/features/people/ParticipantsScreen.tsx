import { useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Link2,
  Pencil,
  Plus,
  Unlink2,
} from 'lucide-react';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { TextField } from '@mister-guiiug/dev-pwa-config/react/field';
import { Sheet } from '@mister-guiiug/dev-pwa-config/react/sheet';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import type { Participant, Space } from '../../backend/ports.ts';
import { byPosition, initialsOf } from '../../domain/people.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { ColorPicker } from '../../components/ColorPicker.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import {
  can,
  useCurrentSpace,
  useMyUserId,
} from '../spaces/useCurrentSpace.ts';
import { PeopleTabs } from './PeopleTabs.tsx';
import { usePeople, usePeopleOf } from './store.ts';

/**
 * LES PERSONNES D'UN ESPACE : l'unité comptable. Une personne existe sans
 * compte (R13) ; « C'est moi » rattache le mien, et se défait. L'ordre est
 * celui de toutes les listes de l'application — c'est lui qui départage les
 * centimes (ADR 0011). Archiver retire des sélections à venir, jamais de
 * l'historique (R16). L'administration modifie ; la base le vérifie (R20).
 */
export function ParticipantsScreen() {
  const { t, m, fmt } = useI18n();
  const space = useCurrentSpace();
  const me = useMyUserId();
  usePeopleOf(space?.id);
  const participants = usePeople(state => state.participants);
  const ready = usePeople(state => state.ready);
  const error = usePeople(state => state.error);
  const clearError = usePeople(state => state.clearError);
  const archive = usePeople(state => state.archiveParticipant);
  const linkMe = usePeople(state => state.linkMe);
  const unlinkMe = usePeople(state => state.unlinkMe);
  const [editing, setEditing] = useState<string | null>(null);

  if (!space) return null;
  const rights = can(space.myRole);
  const editable = rights.admin && !space.archivedAt;
  const active = participants.filter(p => !p.archivedAt).sort(byPosition);
  const archived = participants.filter(p => p.archivedAt).sort(byPosition);
  const iAmLinked =
    me !== null && participants.some(p => p.linkedUserId === me);
  const edited =
    editing && editing !== 'new'
      ? participants.find(p => p.id === editing)
      : undefined;
  const closeSheet = () => {
    clearError();
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <PeopleTabs spaceId={space.id} current="people" />

      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-sm" style={{ color: 'var(--dwc-text-soft)' }}>
          {ready
            ? fmt.plural(active.length, m.people.count, {
                count: active.length,
              })
            : ''}
        </p>
        {editable ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden="true" />
            {t('people.add')}
          </Button>
        ) : null}
      </div>

      {!rights.admin ? (
        <p className="m-0 text-xs" style={{ color: 'var(--dwc-text-soft)' }}>
          {t('people.adminOnly')}
        </p>
      ) : null}

      {error && !editing ? (
        <ErrorBanner message={<ErrorMessage error={error} />} />
      ) : null}

      {!ready ? (
        <SkeletonGroup label={t('people.loading')} lines={3} />
      ) : active.length === 0 ? (
        <EmptyState
          title={t('people.empty')}
          description={t('people.emptyHint')}
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {active.map(participant => (
            <li key={participant.id}>
              <Card className="flex items-center gap-3">
                <Avatar
                  name={participant.displayName}
                  initials={participant.initials}
                  color={participant.avatarColor}
                />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate font-medium">
                    {participant.displayName}
                  </p>
                  {participant.linkedUserId === me ? (
                    <Badge tone="brand" size="xs">
                      {t('people.me')}
                    </Badge>
                  ) : participant.linkedUserId ? (
                    <Badge tone="muted" size="xs">
                      {t('people.linked')}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {me !== null && participant.linkedUserId === me ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={t('people.unlinkMe')}
                      onClick={() => void unlinkMe(participant.id)}
                    >
                      <Unlink2 size={16} aria-hidden="true" />
                    </Button>
                  ) : me !== null && !participant.linkedUserId && !iAmLinked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void linkMe(participant.id)}
                    >
                      <Link2 size={16} aria-hidden="true" />
                      {t('people.linkMe')}
                    </Button>
                  ) : null}
                  {editable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={t('people.edit', {
                        name: participant.displayName,
                      })}
                      onClick={() => setEditing(participant.id)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <details>
          <summary
            className="cursor-pointer text-sm"
            style={{ color: 'var(--dwc-text-soft)' }}
          >
            {t('people.archived')} ({archived.length})
          </summary>
          <p
            className="m-0 mt-1 text-xs"
            style={{ color: 'var(--dwc-text-soft)' }}
          >
            {t('people.archivedHint')}
          </p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {archived.map(participant => (
              <li key={participant.id}>
                <Card className="flex items-center gap-3">
                  <Avatar
                    name={participant.displayName}
                    initials={participant.initials}
                    color={participant.avatarColor}
                  />
                  <p className="m-0 min-w-0 flex-1 truncate">
                    {participant.displayName}
                  </p>
                  {editable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void archive(participant.id, false, participant.version)
                      }
                    >
                      <ArchiveRestore size={16} aria-hidden="true" />
                      {t('people.unarchive', { name: participant.displayName })}
                    </Button>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {editing ? (
        <ParticipantSheet
          key={edited ? `${edited.id}:${edited.version}` : 'new'}
          space={space}
          {...(edited ? { participant: edited } : {})}
          isFirst={edited ? active[0]?.id === edited.id : true}
          isLast={edited ? active[active.length - 1]?.id === edited.id : true}
          onClose={closeSheet}
        />
      ) : null}
    </div>
  );
}

/**
 * LA FICHE D'UNE PERSONNE, dans un panneau : nom, initiales, couleur — et,
 * pour une personne existante, sa place dans l'ordre et son archivage. Le
 * panneau est REMONTÉ à chaque version (`key`) : ses champs naissent des
 * valeurs écrites, sans effet qui recopie des props dans un état.
 */
function ParticipantSheet({
  space,
  participant,
  isFirst,
  isLast,
  onClose,
}: {
  space: Space;
  participant?: Participant;
  isFirst: boolean;
  isLast: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const createParticipant = usePeople(state => state.createParticipant);
  const updateParticipant = usePeople(state => state.updateParticipant);
  const archive = usePeople(state => state.archiveParticipant);
  const move = usePeople(state => state.moveParticipant);
  const error = usePeople(state => state.error);
  const [name, setName] = useState(participant?.displayName ?? '');
  const [initials, setInitials] = useState(participant?.initials ?? '');
  const [color, setColor] = useState(participant?.avatarColor ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const displayName = name.trim();
    if (!displayName) {
      setNameError(t('people.nameRequired'));
      return;
    }
    setNameError(null);
    setBusy(true);
    const saved = participant
      ? await updateParticipant(
          participant.id,
          { displayName, initials: initials.trim(), avatarColor: color },
          participant.version
        )
      : await createParticipant({
          spaceId: space.id,
          displayName,
          initials: initials.trim(),
          avatarColor: color,
        });
    setBusy(false);
    if (saved) onClose();
  };

  const archiveAndClose = async () => {
    if (!participant) return;
    const done = await archive(participant.id, true, participant.version);
    if (done) onClose();
  };

  return (
    <Sheet
      open
      title={
        participant
          ? t('people.edit', { name: participant.displayName })
          : t('people.add')
      }
      onClose={onClose}
    >
      <form
        onSubmit={event => void submit(event)}
        className="flex flex-col gap-4"
      >
        <TextField
          label={t('people.name')}
          hint={t('people.nameHint')}
          value={name}
          maxLength={60}
          required
          onChange={event => setName(event.target.value)}
          {...(nameError ? { error: nameError } : {})}
        />
        <TextField
          label={t('people.initials')}
          hint={t('people.initialsHint')}
          placeholder={initialsOf(name)}
          value={initials}
          maxLength={3}
          onChange={event => setInitials(event.target.value)}
        />
        <ColorPicker
          label={t('people.color')}
          value={color}
          onChange={setColor}
        />
        {error ? (
          <ErrorBanner message={<ErrorMessage error={error} />} />
        ) : null}
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            {participant ? t('people.save') : t('people.create')}
          </Button>
        </div>
      </form>

      {participant ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-disabled={isFirst}
            onClick={() => {
              if (!isFirst) void move(participant.id, 'up');
            }}
          >
            <ChevronUp size={16} aria-hidden="true" />
            {t('people.moveUp', { name: participant.displayName })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-disabled={isLast}
            onClick={() => {
              if (!isLast) void move(participant.id, 'down');
            }}
          >
            <ChevronDown size={16} aria-hidden="true" />
            {t('people.moveDown', { name: participant.displayName })}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void archiveAndClose()}
          >
            <Archive size={16} aria-hidden="true" />
            {t('people.archive', { name: participant.displayName })}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
