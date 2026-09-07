import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { SegmentedControl } from '@mister-guiiug/dev-pwa-config/react/segmented-control';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { dateSlug, downloadText } from '@mister-guiiug/dev-pwa-config/download';
import { useI18n } from '../../i18n/index.ts';
import { backend, coverage } from '../../backend/index.ts';
import { useNotes } from '../home/store.ts';
import { configReport } from '../../app/config/env.ts';

/**
 * L'écran de réglages : le seul écran que TOUTES les apps de la famille ont, et
 * dont la COMPOSITION reste métier — c'est pourquoi le socle livre les briques
 * (`ThemeToggle`, `AppVersion`, `FamilyApps`, `ConfirmDialog`, `downloadText`)
 * et non l'écran. Onze apps en ont un, de 142 à 728 lignes.
 *
 * Ce qu'il montre ici et qui manque partout ailleurs : **le diagnostic de
 * configuration**. Une app déjà en ligne doit pouvoir dire ce qui lui manque et
 * sur quoi elle est retombée, au lieu de laisser croire qu'un compte distant
 * fonctionne alors que tout est resté sur l'appareil.
 *
 * IMPORTER, PAS SEULEMENT EXPORTER. Quinze apps du parc savent exporter ;
 * presque aucune ne sait relire son propre fichier à l'écran — et c'est le
 * seul moyen de changer d'appareil sans compte. Le fichier passe par le port
 * (`versioned-store.import()` en local), donc par le schéma : un fichier
 * d'une autre app ou tronqué est refusé sans rien effacer. Quand des notes
 * existent, l'import demande confirmation, parce qu'il REMPLACE.
 */
export function SettingsScreen() {
  const { t, m, fmt, locale, setLocale, locales } = useI18n();
  const clear = useNotes(state => state.clear);
  const importJson = useNotes(state => state.importJson);
  const notes = useNotes(state => state.notes);
  const ready = useNotes(state => state.ready);
  const load = useNotes(state => state.load);
  const error = useNotes(state => state.error);
  const [confirming, setConfirming] = useState(false);

  // Ouvert directement (lien profond, rechargement), cet écran ne sait pas si
  // des notes existent tant que le port n'a pas été lu : sans cette lecture,
  // l'import remplacerait sans demander. La première version le faisait.
  useEffect(() => {
    if (!ready) void load();
  }, [ready, load]);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Le fichier lu, en attente de confirmation parce que des notes existent. */
  const [pending, setPending] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const exportNotes = async () => {
    const json = await backend.notes.export();
    if (json)
      downloadText(json, `notes-${dateSlug()}.json`, 'application/json');
  };

  const runImport = async (json: string) => {
    const count = await importJson(json);
    setImported(count);
    setFailed(count === null);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Remis à zéro tout de suite : choisir DEUX fois le même fichier doit
    // relancer l'import, et un `<input type=file>` ne signale pas un choix
    // identique au précédent.
    event.target.value = '';
    if (!file) return;
    const json = await file.text();
    if (notes.length > 0) setPending(json);
    else await runImport(json);
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

      <Card>
        <CardHeader title={t('settings.data')} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportNotes()}>
            {t('settings.export')}
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            {t('settings.import')}
          </Button>
          {/* Le vrai champ est masqué visuellement, pas retiré de l'arbre :
              il garde son nom accessible, et un test peut lui donner un
              fichier sans passer par la boîte de dialogue du système. */}
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
        {imported !== null && (
          <p role="status" className="m-0 mt-3 text-sm">
            {fmt.plural(imported, m.settings.imported, { count: imported })}
          </p>
        )}
        {failed && error && (
          <p role="alert" className="m-0 mt-3 text-sm">
            {t('settings.importFailed', { error })}
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        destructive
        title={t('settings.resetConfirm')}
        message={t('settings.resetBody')}
        onConfirm={() => {
          void clear();
          setConfirming(false);
        }}
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
