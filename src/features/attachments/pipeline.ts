import {
  compressImageToMaxBytes,
  stripImageMetadata,
  validateImageFile,
  type ImageSeams,
  type ImageValidationError,
} from '@mister-guiiug/dev-pwa-config/image';

/**
 * LE PIPELINE D'UN JUSTIFICATIF, avant tout envoi : vérifier que c'est une
 * image acceptée, la RÉENCODER sans métadonnées — EXIF, position, numéro de
 * série disparaissent par construction (H10) —, puis la ramener sous la
 * cible si elle est lourde. Les coutures (`ImageSeams`) permettent de le
 * jouer à froid, sans canvas.
 */

/** La borne de la base (0007, `bytes <= 5 Mo`) ; au-delà, la ligne est refusée. */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
/** Ce qu'on vise avant l'envoi : lisible, et léger sur un réseau mobile. */
export const RECEIPT_TARGET_BYTES = 1_200_000;
/** Ce qu'on accepte en entrée : une photo de téléphone, pas un scan brut. */
export const RECEIPT_INPUT_MAX_BYTES = 25 * 1024 * 1024;

export type PrepareResult =
  | { ok: true; blob: Blob; mime: string }
  | { ok: false; error: ImageValidationError };

export async function prepareReceipt(
  file: File,
  seams: ImageSeams = {}
): Promise<PrepareResult> {
  const invalid = validateImageFile(file, {
    maxBytes: RECEIPT_INPUT_MAX_BYTES,
  });
  if (invalid) return { ok: false, error: invalid };
  // Une photo devient du JPEG ; une capture d'écran PNG le reste — la
  // transparence et les aplats y sont mieux servis.
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const stripped = await stripImageMetadata(file, { type, ...seams });
  const sized =
    stripped.size > RECEIPT_TARGET_BYTES
      ? await compressImageToMaxBytes(
          new File([stripped], file.name, { type: stripped.type || type }),
          RECEIPT_TARGET_BYTES,
          seams
        )
      : stripped;
  if (sized.size > RECEIPT_MAX_BYTES) return { ok: false, error: 'size' };
  return { ok: true, blob: sized, mime: sized.type || type };
}
