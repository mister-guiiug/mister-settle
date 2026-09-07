import { describe, expect, it } from 'vitest';
import type { ImageSeams } from '@mister-guiiug/dev-pwa-config/image';
import {
  RECEIPT_INPUT_MAX_BYTES,
  RECEIPT_TARGET_BYTES,
  prepareReceipt,
} from './pipeline.ts';

/**
 * Le pipeline, joué À FROID par ses coutures : pas de canvas, pas de
 * décodage — un « encodeur » qui rend une taille choisie selon la qualité,
 * pour vérifier ce que le pipeline décide, pas ce que le navigateur sait.
 */
const seams = (bytesFor: (quality: number) => number): ImageSeams => ({
  decode: async () => ({ width: 4000, height: 3000 }),
  render: () => ({}),
  encode: async (_frame, quality, type) =>
    new Blob([new Uint8Array(bytesFor(quality))], { type }),
});

const photo = (type = 'image/jpeg', bytes = 3_000_000) =>
  new File([new Uint8Array(bytes)], 'photo.jpg', { type });

describe('prepareReceipt', () => {
  it('refuse ce qui n’est pas une image acceptée, ou trop lourd en entrée', async () => {
    expect(await prepareReceipt(photo('application/pdf'))).toEqual({
      ok: false,
      error: 'type',
    });
    expect(
      await prepareReceipt(photo('image/jpeg', RECEIPT_INPUT_MAX_BYTES + 1))
    ).toEqual({ ok: false, error: 'size' });
  });

  it('réencode toujours — les métadonnées tombent par construction — et garde le PNG en PNG', async () => {
    const result = await prepareReceipt(
      photo('image/png'),
      seams(() => 800)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mime).toBe('image/png');
    expect(result.blob.size).toBe(800);
  });

  it('ramène une image lourde sous la cible', async () => {
    const result = await prepareReceipt(
      photo(),
      seams(quality => (quality > 0.6 ? 2_500_000 : 900_000))
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blob.size).toBeLessThanOrEqual(RECEIPT_TARGET_BYTES);
    expect(result.mime).toBe('image/jpeg');
  });
});
