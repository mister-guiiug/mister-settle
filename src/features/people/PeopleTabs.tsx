import { useNavigate } from 'react-router-dom';
import { SegmentedControl } from '@mister-guiiug/dev-pwa-config/react/segmented-control';
import { useI18n } from '../../i18n/index.ts';

/**
 * PERSONNES OU REGROUPEMENTS : deux écrans, deux chemins, une seule bascule.
 * Un regroupement se lit avec ses personnes ; les mettre côte à côte dit
 * qu'ils vont ensemble — et que seules les personnes comptent (ADR 0012).
 */
export function PeopleTabs({
  spaceId,
  current,
}: {
  spaceId: string;
  current: 'people' | 'groups';
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <SegmentedControl
      value={current}
      ariaLabel={t('people.tabs.label')}
      fullWidth
      options={[
        { value: 'people', label: t('people.tabs.people') },
        { value: 'groups', label: t('people.tabs.groups') },
      ]}
      onChange={value => {
        if (value === current) return;
        void navigate(
          value === 'people'
            ? `/e/${spaceId}/personnes`
            : `/e/${spaceId}/regroupements`
        );
      }}
    />
  );
}
