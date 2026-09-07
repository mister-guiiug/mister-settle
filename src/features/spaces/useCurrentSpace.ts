import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { isRemote } from '../../backend/index.ts';
import { LOCAL_USER_ID } from '../../backend/local.ts';
import type { Space, SpaceRole } from '../../backend/ports.ts';
import { useSpaces } from './store.ts';

/**
 * L'espace de la route courante, lu dans le magasin — chargé si besoin.
 * `null` tant qu'on ne sait pas ; `undefined` quand on sait qu'il n'existe
 * pas (ou plus) pour ce compte.
 */
export function useCurrentSpace(): Space | null | undefined {
  const { spaceId } = useParams();
  const ready = useSpaces(state => state.ready);
  const load = useSpaces(state => state.load);
  const space = useSpaces(state => state.spaces.find(s => s.id === spaceId));

  useEffect(() => {
    if (!ready) void load();
  }, [ready, load]);

  if (!ready) return null;
  return space;
}

/**
 * QUI JE SUIS pour le backend : le compte connecté, ou la personne unique de
 * l'appareil. C'est ce que `linkedUserId` d'une personne compare.
 */
export function useMyUserId(): string | null {
  const { user } = useAuthContext<unknown, { id?: string }>();
  if (!isRemote) return LOCAL_USER_ID;
  return user?.id ?? null;
}

/**
 * Ce que mon rôle me laisse faire — un CONFORT d'affichage. La base décide
 * (ADR 0007, 0014) ; ceci ne fait que masquer les boutons qu'elle refuserait.
 */
export function can(role: SpaceRole | null | undefined) {
  return {
    read: role !== null && role !== undefined,
    contribute: role === 'owner' || role === 'admin' || role === 'contributor',
    admin: role === 'owner' || role === 'admin',
    own: role === 'owner',
  };
}
