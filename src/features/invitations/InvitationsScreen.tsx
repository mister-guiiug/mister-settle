import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import {
  SelectField,
  TextField,
} from '@mister-guiiug/dev-pwa-config/react/field';
import { ShareButton } from '@mister-guiiug/dev-pwa-config/react/share-button';
import { Sheet } from '@mister-guiiug/dev-pwa-config/react/sheet';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import { isRemote } from '../../backend/index.ts';
import type { Invitation, Participant, Space } from '../../backend/ports.ts';
import { invitationState, invitationUrl } from '../../domain/invitations.ts';
import { byPosition } from '../../domain/people.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { can, useCurrentSpace } from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';
import { useInvitations, useInvitationsOf } from './store.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;
const ROLES = ['contributor', 'reader', 'admin'] as const;

/**
 * LES INVITATIONS : un lien porte un rôle, une durée, un nombre d'usages, et
 * — si l'administration cible une personne — le rattachement à celle-ci
 * (R13). Le jeton n'apparaît QU'UNE FOIS, à la création : il se partage
 * tout de suite, puis ne se relit plus, seulement se révoque. Sans compte,
 * l'écran le dit au lieu d'échouer.
 */
export function InvitationsScreen() {
  const { t, fmt } = useI18n();
  const space = useCurrentSpace();
  usePeopleOf(space?.id);
  useInvitationsOf(isRemote ? space?.id : undefined);
  const participants = usePeople(state => state.participants);
  const invitations = useInvitations(state => state.invitations);
  const ready = useInvitations(state => state.ready);
  const error = useInvitations(state => state.error);
  const revoke = useInvitations(state => state.revoke);
  const clearError = useInvitations(state => state.clearError);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{
    invitation: Invitation;
    url: string;
  } | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);

  if (!space) return null;
  if (!isRemote) {
    return (
      <EmptyState
        title={t('invitations.localTitle')}
        description={t('invitations.localBody')}
      />
    );
  }
  const rights = can(space.myRole);
  if (!rights.admin) {
    return <EmptyState title={t('invitations.adminOnly')} />;
  }
  const unlinked = participants
    .filter(p => !p.archivedAt && !p.linkedUserId)
    .sort(byPosition);
  const nameOf = (id: string) =>
    participants.find(p => p.id === id)?.displayName ?? '?';

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-xs" style={soft}>
        {t('invitations.hint')}
      </p>

      {issued ? (
        <Card>
          <CardHeader
            title={t('invitations.issuedTitle')}
            subtitle={t('invitations.issuedHint')}
          />
          <p className="m-0 break-all text-sm">
            <code>{issued.url}</code>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ShareButton
              url={issued.url}
              title={t('invitations.shareTitle', { space: space.name })}
              label={t('invitations.share')}
            />
            <Button variant="ghost" onClick={() => setIssued(null)}>
              {t('invitations.done')}
            </Button>
          </div>
        </Card>
      ) : null}

      <div>
        <Button
          variant="primary"
          onClick={() => {
            clearError();
            setCreating(true);
          }}
        >
          <Plus size={18} aria-hidden="true" />
          {t('invitations.create')}
        </Button>
      </div>

      {error && !creating ? (
        <ErrorBanner message={<ErrorMessage error={error} />} />
      ) : null}

      <Card>
        <CardHeader title={t('invitations.list')} />
        {!ready ? (
          <SkeletonGroup label={t('invitations.title')} lines={2} />
        ) : invitations.length === 0 ? (
          <p className="m-0 text-sm" style={soft}>
            {t('invitations.empty')}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {invitations.map(invitation => {
              const state = invitationState(invitation);
              return (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="m-0">
                      {t(`spaces.role.${invitation.role}`)}
                      {invitation.targetParticipantId
                        ? ` · ${t('invitations.for', {
                            name: nameOf(invitation.targetParticipantId),
                          })}`
                        : ''}
                    </p>
                    <p className="m-0 text-xs" style={soft}>
                      {t('invitations.until', {
                        date: fmt.dateTime(invitation.expiresAt),
                      })}
                      {' · '}
                      {t('invitations.uses', {
                        uses: invitation.uses,
                        max: invitation.maxUses,
                      })}
                    </p>
                  </div>
                  <Badge
                    tone={state === 'active' ? 'success' : 'muted'}
                    size="xs"
                  >
                    {t(`invitations.state.${state}`)}
                  </Badge>
                  {state === 'active' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRevoking(invitation)}
                    >
                      {t('invitations.revoke')}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {creating ? (
        <InvitationSheet
          space={space}
          unlinked={unlinked}
          onClose={() => setCreating(false)}
          onCreated={(invitation, token) => {
            setIssued({
              invitation,
              url: invitationUrl(
                token,
                window.location.origin,
                import.meta.env.BASE_URL
              ),
            });
            setCreating(false);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        destructive
        title={t('invitations.revokeConfirm')}
        message={t('invitations.revokeBody')}
        confirmLabel={t('invitations.revoke')}
        onConfirm={() => {
          if (revoking) void revoke(revoking.id);
          setRevoking(null);
        }}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

function InvitationSheet({
  space,
  unlinked,
  onClose,
  onCreated,
}: {
  space: Space;
  unlinked: Participant[];
  onClose: () => void;
  onCreated: (invitation: Invitation, token: string) => void;
}) {
  const { t } = useI18n();
  const create = useInvitations(state => state.create);
  const error = useInvitations(state => state.error);
  const [role, setRole] = useState<(typeof ROLES)[number]>('contributor');
  const [target, setTarget] = useState('');
  const [days, setDays] = useState('7');
  const [maxUses, setMaxUses] = useState('1');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const issued = await create({
      spaceId: space.id,
      role,
      targetParticipantId: target || null,
      expiresInDays: Math.min(90, Math.max(1, Number(days) || 7)),
      maxUses: Math.min(100, Math.max(1, Number(maxUses) || 1)),
    });
    setBusy(false);
    if (issued) onCreated(issued.invitation, issued.token);
  };

  return (
    <Sheet open title={t('invitations.create')} onClose={onClose}>
      <form
        onSubmit={event => void submit(event)}
        className="flex flex-col gap-4"
      >
        <SelectField
          label={t('invitations.role')}
          value={role}
          onChange={event => {
            const value = event.target.value;
            setRole(
              value === 'reader' || value === 'admin' ? value : 'contributor'
            );
          }}
        >
          {ROLES.map(value => (
            <option key={value} value={value}>
              {t(`spaces.role.${value}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('invitations.target')}
          value={target}
          onChange={event => setTarget(event.target.value)}
        >
          <option value="">{t('invitations.noTarget')}</option>
          {unlinked.map(person => (
            <option key={person.id} value={person.id}>
              {person.displayName}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('invitations.days')}
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={event => setDays(event.target.value)}
        />
        <TextField
          label={t('invitations.maxUses')}
          type="number"
          min={1}
          max={100}
          value={maxUses}
          onChange={event => setMaxUses(event.target.value)}
        />
        {error ? (
          <ErrorBanner message={<ErrorMessage error={error} />} />
        ) : null}
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            {t('invitations.submit')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
