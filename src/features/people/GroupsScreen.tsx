import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { TextField } from '@mister-guiiug/dev-pwa-config/react/field';
import { Sheet } from '@mister-guiiug/dev-pwa-config/react/sheet';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import type { Group, Participant, Space } from '../../backend/ports.ts';
import { byPosition, expandGroup, pickColor } from '../../domain/people.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { ColorPicker } from '../../components/ColorPicker.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { can, useCurrentSpace } from '../spaces/useCurrentSpace.ts';
import { PeopleTabs } from './PeopleTabs.tsx';
import { usePeople, usePeopleOf } from './store.ts';

/**
 * LES REGROUPEMENTS : des raccourcis de sélection, jamais des unités de
 * compte (ADR 0012). Chaque ligne se DÉPLIE en personnes réellement retenues
 * — c'est ce que l'écran montre, pour que personne n'imagine qu'un montant
 * puisse aller « à la famille ». Supprimer ne touche ni les personnes ni les
 * dépenses (R15) : la composition figée vit sur chaque dépense validée.
 */
export function GroupsScreen() {
  const { t, m, fmt } = useI18n();
  const space = useCurrentSpace();
  usePeopleOf(space?.id);
  const participants = usePeople(state => state.participants);
  const groups = usePeople(state => state.groups);
  const ready = usePeople(state => state.ready);
  const error = usePeople(state => state.error);
  const clearError = usePeople(state => state.clearError);
  const archiveGroup = usePeople(state => state.archiveGroup);
  const removeGroup = usePeople(state => state.removeGroup);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Group | null>(null);

  if (!space) return null;
  const rights = can(space.myRole);
  const editable = rights.admin && !space.archivedAt;
  const active = groups.filter(g => !g.archivedAt);
  const archived = groups.filter(g => g.archivedAt);
  const edited =
    editing && editing !== 'new'
      ? groups.find(g => g.id === editing)
      : undefined;
  const closeSheet = () => {
    clearError();
    setEditing(null);
  };

  const row = (group: Group) => {
    const members = expandGroup(group, participants);
    return (
      <Card className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-10 w-3 shrink-0 rounded-full"
          style={{ background: group.color || pickColor(group.name) }}
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-medium">{group.name}</p>
          <p className="m-0 text-xs" style={{ color: 'var(--dwc-text-soft)' }}>
            {fmt.plural(members.length, m.groups.memberCount, {
              count: members.length,
            })}
          </p>
          <p className="m-0 truncate text-sm">
            {members.length
              ? members.map(p => p.displayName).join(', ')
              : t('groups.noMembers')}
          </p>
        </div>
        {editable && !group.archivedAt ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={t('groups.edit', { name: group.name })}
              onClick={() => setEditing(group.id)}
            >
              <Pencil size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={t('groups.remove', { name: group.name })}
              onClick={() => setRemoving(group)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {editable && group.archivedAt ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void archiveGroup(group.id, false, group.version)}
          >
            <ArchiveRestore size={16} aria-hidden="true" />
            {t('groups.unarchive', { name: group.name })}
          </Button>
        ) : null}
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PeopleTabs spaceId={space.id} current="groups" />

      <div className="flex items-center justify-end gap-3">
        {editable ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden="true" />
            {t('groups.add')}
          </Button>
        ) : null}
      </div>

      {!rights.admin ? (
        <p className="m-0 text-xs" style={{ color: 'var(--dwc-text-soft)' }}>
          {t('groups.adminOnly')}
        </p>
      ) : null}

      {error && !editing ? (
        <ErrorBanner message={<ErrorMessage error={error} />} />
      ) : null}

      {!ready ? (
        <SkeletonGroup label={t('people.loading')} lines={3} />
      ) : active.length === 0 ? (
        <EmptyState
          title={t('groups.empty')}
          description={t('groups.emptyHint')}
        />
      ) : (
        <ul className="settle-liste m-0 flex list-none flex-col gap-2 p-0">
          {active.map(group => (
            <li key={group.id}>{row(group)}</li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <details>
          <summary
            className="cursor-pointer text-sm"
            style={{ color: 'var(--dwc-text-soft)' }}
          >
            {t('groups.archived')} ({archived.length})
          </summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {archived.map(group => (
              <li key={group.id}>{row(group)}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {editing ? (
        <GroupSheet
          key={edited ? `${edited.id}:${edited.version}` : 'new'}
          space={space}
          participants={participants
            .filter(p => !p.archivedAt)
            .sort(byPosition)}
          {...(edited ? { group: edited } : {})}
          onClose={closeSheet}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        destructive
        title={t('groups.removeConfirm', { name: removing?.name ?? '' })}
        message={t('groups.removeBody')}
        onConfirm={() => {
          if (removing) void removeGroup(removing.id);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/**
 * LA COMPOSITION D'UN REGROUPEMENT : un nom, une couleur, et les personnes
 * cochées — actives seulement ; un membre archivé reste dans la composition
 * tant qu'on ne l'en retire pas, et le dépliage l'ignore. Remonté à chaque
 * version (`key`), comme la fiche d'une personne.
 */
function GroupSheet({
  space,
  participants,
  group,
  onClose,
}: {
  space: Space;
  participants: Participant[];
  group?: Group;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const createGroup = usePeople(state => state.createGroup);
  const updateGroup = usePeople(state => state.updateGroup);
  const archiveGroup = usePeople(state => state.archiveGroup);
  const error = usePeople(state => state.error);
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? '');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group?.memberIds ?? [])
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('groups.nameRequired'));
      return;
    }
    setNameError(null);
    setBusy(true);
    const memberIds = [...selected];
    const saved = group
      ? await updateGroup(
          group.id,
          { name: trimmed, color, memberIds },
          group.version
        )
      : await createGroup({
          spaceId: space.id,
          name: trimmed,
          color,
          memberIds,
        });
    setBusy(false);
    if (saved) onClose();
  };

  const archiveAndClose = async () => {
    if (!group) return;
    const done = await archiveGroup(group.id, true, group.version);
    if (done) onClose();
  };

  return (
    <Sheet
      open
      title={group ? t('groups.edit', { name: group.name }) : t('groups.add')}
      onClose={onClose}
    >
      <form
        onSubmit={event => void submit(event)}
        className="flex flex-col gap-4"
      >
        <TextField
          label={t('groups.name')}
          value={name}
          maxLength={60}
          required
          onChange={event => setName(event.target.value)}
          {...(nameError ? { error: nameError } : {})}
        />
        <ColorPicker
          label={t('groups.color')}
          value={color}
          onChange={setColor}
        />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">
            {t('groups.members')}
          </legend>
          {participants.map(participant => (
            <label
              key={participant.id}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(participant.id)}
                onChange={() => toggle(participant.id)}
              />
              <Avatar
                name={participant.displayName}
                initials={participant.initials}
                color={participant.avatarColor}
                size="sm"
              />
              <span>{participant.displayName}</span>
            </label>
          ))}
          <p className="m-0 text-xs" style={{ color: 'var(--dwc-text-soft)' }}>
            {t('groups.membersHint')}
          </p>
        </fieldset>
        {error ? (
          <ErrorBanner message={<ErrorMessage error={error} />} />
        ) : null}
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            {group ? t('groups.save') : t('groups.create')}
          </Button>
        </div>
      </form>

      {group ? (
        <div className="mt-6">
          <Button
            variant="danger"
            size="sm"
            onClick={() => void archiveAndClose()}
          >
            <Archive size={16} aria-hidden="true" />
            {t('groups.archive', { name: group.name })}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
