import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import {
  SelectField,
  TextAreaField,
  TextField,
} from '@mister-guiiug/dev-pwa-config/react/field';
import { useI18n } from '../../i18n/index.ts';
import type { Category, Space } from '../../backend/ports.ts';
import type { ExpenseForm } from '../../domain/expense-form.ts';
import { parseAmount } from '../../domain/money.ts';
import { categoryName } from './category-label.ts';

/**
 * PAS 1 — QUOI ET COMBIEN : libellé, montant, date, catégorie, note. Le
 * montant se tape avec virgule ou point (R1) ; il est lu en entier d'unités
 * mineures, jamais en flottant. Les erreurs de ce pas n'apparaissent qu'au
 * premier « Continuer » (`touched`), pas pendant qu'on tape.
 */
export function StepWhat({
  form,
  setForm,
  space,
  categories,
  touched,
}: {
  form: ExpenseForm;
  setForm: (next: ExpenseForm) => void;
  space: Space;
  categories: Category[];
  touched: boolean;
}) {
  const { t } = useI18n();
  const parents = categories.filter(c => c.parentId === null && !c.archivedAt);
  const children = categories.filter(
    c => c.parentId !== null && c.parentId === form.categoryId && !c.archivedAt
  );
  const parsed = parseAmount(form.amountText, space.minorUnit);
  const amountError =
    form.amountText.trim() !== '' && parsed === null
      ? t('wizard.amountInvalid')
      : touched && (parsed === null || parsed <= 0)
        ? t('wizard.amountRequired')
        : null;

  return (
    <Card className="flex flex-col gap-4">
      <TextField
        label={t('wizard.label')}
        placeholder={t('wizard.labelPlaceholder')}
        value={form.label}
        maxLength={120}
        required
        onChange={event => setForm({ ...form, label: event.target.value })}
        {...(touched && !form.label.trim()
          ? { error: t('wizard.labelRequired') }
          : {})}
      />
      <TextField
        label={t('wizard.amount', { currency: space.currency })}
        hint={t('wizard.amountHint')}
        inputMode="decimal"
        value={form.amountText}
        required
        onChange={event => setForm({ ...form, amountText: event.target.value })}
        {...(amountError ? { error: amountError } : {})}
      />
      <TextField
        label={t('wizard.date')}
        type="date"
        value={form.spentOn}
        required
        onChange={event => setForm({ ...form, spentOn: event.target.value })}
      />
      <SelectField
        label={t('wizard.category')}
        value={form.categoryId ?? ''}
        onChange={event =>
          setForm({
            ...form,
            categoryId: event.target.value || null,
            subcategoryId: null,
          })
        }
      >
        <option value="">{t('wizard.noCategory')}</option>
        {parents.map(category => (
          <option key={category.id} value={category.id}>
            {categoryName(category, t)}
          </option>
        ))}
      </SelectField>
      {children.length > 0 ? (
        <SelectField
          label={t('wizard.subcategory')}
          value={form.subcategoryId ?? ''}
          onChange={event =>
            setForm({ ...form, subcategoryId: event.target.value || null })
          }
        >
          <option value="">—</option>
          {children.map(category => (
            <option key={category.id} value={category.id}>
              {categoryName(category, t)}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextAreaField
        label={t('wizard.note')}
        value={form.note}
        maxLength={2000}
        rows={3}
        onChange={event => setForm({ ...form, note: event.target.value })}
      />
    </Card>
  );
}
