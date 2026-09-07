import { describe, expect, it } from 'vitest';
import type { IdbStore } from '@mister-guiiug/dev-pwa-config/idb';
import { withReadCache, type CacheHooks } from './cached.ts';
import { BackendError, type Backend, type Space } from './ports.ts';

/** Un IndexedDB en mémoire : juste ce que la cache lui demande. */
function fakeIdb(): IdbStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    name: 'test',
    available: async () => true,
    get: (async (key: string, fallback?: unknown) =>
      map.has(key) ? map.get(key) : fallback) as IdbStore['get'],
    set: async (key, value) => {
      map.set(key, value);
      return true;
    },
    remove: async key => map.delete(key),
    keys: async () => [...map.keys()],
    clear: async () => {
      map.clear();
      return true;
    },
    getBlob: async () => undefined,
    setBlob: async () => true,
    removeBlob: async () => true,
    close: async () => {},
  };
}

const space: Space = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Coloc',
  description: '',
  currency: 'EUR',
  minorUnit: 2,
  icon: '',
  color: '',
  archivedAt: null,
  version: 1,
  myRole: 'owner',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/** Un backend dont seule la liste des espaces compte ici. */
function innerWith(list: () => Promise<Space[]>): Backend {
  const never = () => Promise.reject(new Error('pas ici'));
  const port = new Proxy({}, { get: () => never });
  return {
    spaces: { list } as unknown as Backend['spaces'],
    participants: port as Backend['participants'],
    groups: port as Backend['groups'],
    categories: port as Backend['categories'],
    expenses: port as Backend['expenses'],
    settlements: port as Backend['settlements'],
    invitations: port as Backend['invitations'],
    activity: port as Backend['activity'],
    attachments: port as Backend['attachments'],
  };
}

function hooks(online = true) {
  const events: string[] = [];
  const h: CacheHooks = {
    onStale: at => events.push(`stale:${at}`),
    onFresh: () => events.push('fresh'),
    isOnline: () => online,
  };
  return { h, events };
}

describe('withReadCache', () => {
  it('garde la dernière réponse, et la ressert quand le réseau manque', async () => {
    const idb = fakeIdb();
    let fail = false;
    const inner = innerWith(async () => {
      if (fail) throw new BackendError('network', 'coupé');
      return [space];
    });
    const { h, events } = hooks();
    const backend = withReadCache(inner, idb, h);

    expect(await backend.spaces.list()).toEqual([space]);
    expect(events).toEqual(['fresh']);
    expect(idb.map.has('spaces')).toBe(true);

    fail = true;
    expect(await backend.spaces.list()).toEqual([space]);
    expect(events[1]).toMatch(/^stale:20/);
  });

  it('ne ressert rien sur un refus qui n’est pas le réseau', async () => {
    const idb = fakeIdb();
    let cause: BackendError = new BackendError('network', 'coupé');
    const inner = innerWith(async () => {
      throw cause;
    });
    const backend = withReadCache(inner, idb, hooks().h);
    await idb.set('spaces', { at: '2026-09-01T00:00:00.000Z', data: [space] });
    expect(await backend.spaces.list()).toEqual([space]);

    cause = new BackendError('forbidden', 'non');
    await expect(backend.spaces.list()).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('refuse une copie qui ne passe plus le schéma', async () => {
    const idb = fakeIdb();
    const inner = innerWith(async () => {
      throw new BackendError('network', 'coupé');
    });
    const backend = withReadCache(inner, idb, hooks(false).h);
    await idb.set('spaces', {
      at: '2026-09-01T00:00:00.000Z',
      data: [{ id: 'pas-un-uuid' }],
    });
    await expect(backend.spaces.list()).rejects.toMatchObject({
      code: 'network',
    });
  });
});
