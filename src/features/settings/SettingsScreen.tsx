import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { SegmentedControl } from '@mister-guiiug/dev-pwa-config/react/segmented-control';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { dateSlug, downloadText } from '@mister-guiiug/dev-pwa-config/download';
import { useI18n } from '../../i18n/index.ts';
import { coverage, isRemote } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { configReport } from '../../app/config/env.ts';

/**
 * L'écran de réglages : apparence, langue, diagnostic de configuration, et —
 * sans compte — les données de l'appareil.
 *
 * IMPORTER, PAS SEULEMENT EXPORTER (squelette). Le fichier passe par le
 * magasin versionné (`localDb.import()`), donc par le schéma : un fichier
 * d'une autre application ou tronqué est refusé sans rien effacer. Quand des
 * espaces existent, l'import demande confirmation, parce qu'il REMPLACE.
 *
 * En mode distant, les données vivent dans la base : l'export utile est celui
 * d'un espace (CSV, lot 13), pas celui de l'appareil.
 */
export function SettingsScreen() {
  const { t, locale, setLocale, locales } = useI18n();
  const spaces = useSpaces(state => state.spaces);
  const load = useSpaces(state => state.load);
  const [confirming, setConfirming] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const exportData = () => {
    const json = localDb.export();
    if (json)
      downloadText(
        json,
        `mister-settle-${dateSlug()}.json`,
        'application/json'
      );
  };

  const runImport = async (json: string) => {
    try {
      localDb.import(json);
      setImported(true);
      setImportError(null);
      await load();
    } catch (cause) {
      setImported(false);
      setImportError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const json = await file.text();
    if (spaces.length > 0) setPending(json);
    else await runImport(json);
  };

  const reset = async () => {
    localDb.clear();
    setConfirming(false);
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title={t('settings.appearance')} />
        <ThemeToggle />
      </Card>

      <Card>
        <CardHeader title={t('settings.language')} />
        <SegmentedControl
          value={locale}
          onChange={value => setLocale(value as typeof locale)}
          ariaLabel={t('settings.language')}
          options={locales.map(code => ({
            value: code,
            label: code.toUpperCase(),
          }))}
        />
      </Card>

      <Card>
        <CardHeader
          title={t('settings.backend')}
          subtitle={coverage.kind ?? t('settings.backendLocal')}
        />
        <ul className="m-0 list-none p-0 text-sm">
          {configReport().map(entry => (
            <li key={entry.name} className="flex justify-between gap-3 py-1">
              <code>{entry.name}</code>
              <span style={{ color: 'var(--dwc-text-soft)' }}>
                {entry.present ? '✓' : entry.fallback}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {!isRemote ? (
        <Card>
          <CardHeader
            title={t('settings.data')}
            subtitle={t('settings.dataHint')}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportData}>
              {t('settings.export')}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              {t('settings.import')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label={t('settings.import')}
              onChange={event => void onFile(event)}
            />
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {t('settings.reset')}
            </Button>
          </div>
          {imported ? (
            <p role="status" className="m-0 mt-3 text-sm">
              {t('settings.imported')}
            </p>
          ) : null}
          {importError ? (
            <p role="alert" className="m-0 mt-3 text-sm">
              {t('settings.importFailed', { error: importError })}
            </p>
          ) : null}
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirming}
        destructive
        title={t('settings.resetConfirm')}
        message={t('settings.resetBody')}
        onConfirm={() => void reset()}
        onCancel={() => setConfirming(false)}
      />

      <ConfirmDialog
        open={pending !== null}
        title={t('settings.importConfirm')}
        message={t('settings.importBody')}
        onConfirm={() => {
          const json = pending;
          setPending(null);
          if (json !== null) void runImport(json);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
