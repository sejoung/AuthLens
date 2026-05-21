import type { Route } from '../state/store.js';
import { store, useAppState } from '../state/store.js';

const ITEMS: Array<{ id: Route; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: '◌' },
  { id: 'capture', label: 'Capture', icon: '◎' },
  { id: 'analysis', label: 'Analysis', icon: '⊚' },
  { id: 'report', label: 'Reports', icon: '☰' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const state = useAppState();
  return (
    <nav className="sidebar" aria-label="Primary navigation">
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
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
