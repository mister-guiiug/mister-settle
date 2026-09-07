import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import type { Attachment } from '../../backend/ports.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { toUiError, type UiError } from '../spaces/store.ts';
import { prepareReceipt, type PrepareResult } from './pipeline.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;

type Parent = { expenseId: string } | { settlementId: string };

/**
 * LES JUSTIFICATIFS D'UNE DÉPENSE (ou la preuve d'un remboursement) : des
 * photos, réencodées sans métadonnées avant l'envoi (`prepareReceipt`),
 * rangées dans un bucket PRIVÉ, lues par URL signée courte — sur l'appareil,
 * un objet en IndexedDB et une URL d'objet. Le pipeline s'injecte
 * (`prepare`) : les tests n'ont pas de canvas.
 */
export function AttachmentsCard({
  spaceId,
  parent,
  editable,
  prepare = prepareReceipt,
}: {
  spaceId: string;
  parent: Parent;
  editable: boolean;
  prepare?: (file: File) => Promise<PrepareResult>;
}) {
  const { t, m, fmt } = useI18n();
  const expenseId = 'expenseId' in parent ? parent.expenseId : undefined;
  const settlementId =
    'settlementId' in parent ? parent.settlementId : undefined;
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = expenseId
    ? { expenseId }
    : { settlementId: settlementId ?? '' };

  useEffect(() => {
    let cancelled = false;
    const where = expenseId
      ? { expenseId }
      : { settlementId: settlementId ?? '' };
    backend.attachments.list(where).then(
      list => {
        if (!cancelled) setItems(list);
      },
      cause => {
        if (!cancelled) setError(toUiError(cause));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [expenseId, settlementId]);

  // Les URL se résolvent en une fois par liste : signées et courtes côté
  // base, URL d'objet sur l'appareil. Un échec laisse une case vide.
  useEffect(() => {
    if (!items || items.length === 0) return;
    let cancelled = false;
    void Promise.all(
      items.map(
        async item =>
          [
            item.id,
            await backend.attachments.url(item).catch(() => ''),
          ] as const
      )
    ).then(entries => {
      if (!cancelled) setUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepare(file);
      if (!prepared.ok) {
        setError({
          code: 'invalid',
          detail: prepared.error === 'type' ? 'image-type' : 'image-size',
        });
        return;
      }
      const saved = await backend.attachments.upload(
        spaceId,
        query,
        prepared.blob,
        prepared.mime
      );
      setItems(previous => [...(previous ?? []), saved]);
    } catch (cause) {
      setError(toUiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (attachment: Attachment) => {
    setRemoving(null);
    try {
      await backend.attachments.remove(attachment.id);
      setItems(previous =>
        (previous ?? []).filter(item => item.id !== attachment.id)
      );
    } catch (cause) {
      setError(toUiError(cause));
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('attachments.title')}
        subtitle={
          items
            ? fmt.plural(items.length, m.attachments.count, {
                count: items.length,
              })
            : ''
        }
      />
      {error ? (
        <ErrorBanner
          message={<ErrorMessage error={error} />}
          className="mb-3"
        />
      ) : null}
      {items === null ? (
        <SkeletonGroup label={t('attachments.title')} lines={1} />
      ) : items.length === 0 ? (
        <p className="m-0 text-sm" style={soft}>
          {t('attachments.empty')}
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
          {items.map((item, index) => (
            <li key={item.id} className="relative">
              <a
                href={urls[item.id] || undefined}
                target="_blank"
                rel="noreferrer"
                aria-label={t('attachments.open', { n: index + 1 })}
              >
                {urls[item.id] ? (
                  <img
                    src={urls[item.id]}
                    alt={t('attachments.alt', { n: index + 1 })}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex aspect-square items-center justify-center rounded-lg text-xs"
                    style={{ background: 'var(--dwc-surface-2)' }}
                  >
                    …
                  </span>
                )}
              </a>
              {editable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={t('attachments.remove', { n: index + 1 })}
                  className="absolute right-1 top-1"
                  onClick={() => setRemoving(item)}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            aria-label={t('attachments.add')}
            onChange={event => void onFile(event)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              loading={busy}
              onClick={() => input.current?.click()}
            >
              <Camera size={16} aria-hidden="true" />
              {t('attachments.add')}
            </Button>
            <span className="text-xs" style={soft}>
              {t('attachments.hint')}
            </span>
          </div>
        </>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        destructive
        title={t('attachments.removeConfirm')}
        message={t('attachments.removeBody')}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}
