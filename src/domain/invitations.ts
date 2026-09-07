import type { Invitation } from '../backend/ports.ts';

/**
 * LES INVITATIONS, CÔTÉ DOMAINE : l'état d'un lien et son adresse. Le jeton
 * lui-même n'est rendu qu'une fois par la base, jamais stocké en clair
 * (0007) ; ici on ne fait que le porter dans une adresse, et le relire.
 */

export type InvitationState = 'active' | 'revoked' | 'expired' | 'exhausted';

/** Révoqué prime sur expiré, qui prime sur épuisé : la raison la plus définitive d'abord. */
export function invitationState(
  invitation: Pick<Invitation, 'revokedAt' | 'expiresAt' | 'uses' | 'maxUses'>,
  now: Date = new Date()
): InvitationState {
  if (invitation.revokedAt) return 'revoked';
  if (new Date(invitation.expiresAt).getTime() <= now.getTime())
    return 'expired';
  if (invitation.uses >= invitation.maxUses) return 'exhausted';
  return 'active';
}

/**
 * L'adresse d'un lien : l'origine SERVIE et la base de Vite — jamais une
 * constante, le même bundle tourne en local et sur Pages.
 */
export function invitationUrl(
  token: string,
  origin: string,
  base: string
): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${origin}${prefix}invitation/${encodeURIComponent(token)}`;
}

/** Le jeton, depuis une adresse complète ou collé tel quel. */
export function tokenFromInput(text: string): string {
  const trimmed = text.trim();
  const match = /invitation\/([^/?#]+)/.exec(trimmed);
  return decodeURIComponent(match?.[1] ?? trimmed);
}
