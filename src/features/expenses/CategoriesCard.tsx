import { useState, type FormEvent } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import {
  SelectField,
  TextField,
} from '@mister-guiiug/dev-pwa-config/react/field';
import { useI18n } from '../../i18n/index.ts';
import type { Space } from '../../backend/ports.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { categoryName } from './category-label.ts';
import { useExpenses, useExpensesOf } from './store.ts';

/**
 * LES CATÉGORIES PROPRES À L'ESPACE, dans ses réglages : le catalogue commun
 * ne se modifie pas ici — il est à tout le monde — mais chaque espace peut
 * ajouter les siennes, à un niveau ou sous une catégorie principale, et les
 * archiver. L'administration seule ; la base le vérifie (R20).
 */
export function CategoriesCard({
  space,
  editable,
}: {
  space: Space;
  editable: boolean;
}) {
  const { t } = useI18n();
  useExpensesOf(space.id);
  const categories = useExpenses(state => state.categories);
  const createCategory = useExpenses(state => state.createCategory);
  const archiveCategory = useExpenses(state => state.archiveCategory);
  const error = useExpenses(state => state.error);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);

  const own = categories.filter(c => c.spaceId === space.id);
  const parents = categories.filter(c => c.parentId === null && !c.archivedAt);
  const parentName = (id: string | null) => {
    const parent = categories.find(c => c.id === id);
    return parent ? categoryName(parent, t) : '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const created = await createCategory({
      spaceId: space.id,
      name: name.trim(),
      parentId: parentId || null,
    });
    setBusy(false);
    if (created) {
      setName('');
      setParentId('');
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('categories.manage')}
        subtitle={t('categories.manageHint')}
      />
      {own.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: 'var(--dwc-text-soft)' }}>
          {t('categories.empty')}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          {own.map(category => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-2 py-1"
            >
              <span className={category.archivedAt ? 'line-through' : ''}>
                {category.parentId ? `${parentName(category.parentId)} › ` : ''}
                {category.name}
              </span>
              {editable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void archiveCategory(category.id, !category.archivedAt)
                  }
                >
                  {category.archivedAt
                    ? t('categories.unarchive', { name: category.name })
                    : t('categories.archive', { name: category.name })}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <form
          onSubmit={event => void submit(event)}
          className="mt-4 flex flex-col gap-3"
        >
          <TextField
            label={t('categories.name')}
            value={name}
            maxLength={60}
            onChange={event => setName(event.target.value)}
          />
          <SelectField
            label={t('categories.parent')}
            value={parentId}
            onChange={event => setParentId(event.target.value)}
          >
            <option value="">{t('categories.none')}</option>
            {parents.map(parent => (
              <option key={parent.id} value={parent.id}>
                {categoryName(parent, t)}
              </option>
            ))}
          </SelectField>
          <div>
            <Button type="submit" variant="outline" loading={busy}>
              {t('categories.create')}
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <ErrorBanner
          message={<ErrorMessage error={error} />}
          className="mt-3"
        />
      ) : null}
    </Card>
  );
}
