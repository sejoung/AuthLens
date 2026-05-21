import { useTranslation } from 'react-i18next';
import type { Route } from '../state/store.js';
import { store, useAppState } from '../state/store.js';

const ITEMS: Array<{ id: Route; labelKey: string; icon: string }> = [
  { id: 'home', labelKey: 'nav.home', icon: '⌂' },
  { id: 'capture', labelKey: 'nav.capture', icon: '◎' },
  { id: 'analysis', labelKey: 'nav.analysis', icon: '⊚' },
  { id: 'report', labelKey: 'nav.reports', icon: '☰' },
  { id: 'settings', labelKey: 'nav.settings', icon: '⚙' },
];

export function Sidebar() {
  const state = useAppState();
  const { t } = useTranslation();
  return (
    <nav className="sidebar" aria-label={t('nav.home') /* a11y label */}>
      {ITEMS.map((item) => {
        const active = state.route === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => store.navigate(item.id)}
            className={`sidebar__item ${active ? 'sidebar__item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
