import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { store, useAppState } from '../state/store.js';
import { changeLanguage, currentLanguage, SUPPORTED_LANGS } from '../i18n/index.js';

export function SettingsPage() {
  const state = useAppState();
  const { t } = useTranslation();
  const { settings } = state;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lang = currentLanguage();

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">{t('settings.eyebrow')}</span>
        <h1 className="page-header__title">{t('settings.title')}</h1>
        <p className="page-header__lede">{t('settings.lede')}</p>
      </header>

      <div className="card">
        <h2 className="card__title">{t('settings.languageTitle')}</h2>
        <p className="muted text-sm">{t('settings.languageDesc')}</p>
        <div
          className="row"
          role="radiogroup"
          aria-label={t('settings.languageTitle')}
          style={{ marginTop: 'var(--space-3)' }}
        >
          {SUPPORTED_LANGS.map((code) => (
            <label key={code} className="row text-sm" style={{ gap: 'var(--space-2)' }}>
              <input
                type="radio"
                name="language"
                value={code}
                checked={lang === code}
                onChange={() => {
                  void changeLanguage(code);
                }}
              />
              <span>{t(`settings.language${code === 'en' ? 'En' : 'Ko'}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">{t('settings.maskingTitle')}</h2>
        <div className="stack">
          <label className="row text-sm">
            <input
              type="checkbox"
              checked={settings.revealRawByDefault}
              onChange={(e) =>
                store.updateSettings({ revealRawByDefault: e.target.checked })
              }
            />
            <span>
              {t('settings.revealRaw')}
              <div className="muted text-xs">{t('settings.revealRawDesc')}</div>
            </span>
          </label>
          {settings.revealRawByDefault && (
            <div className="reveal-warning text-xs" role="alert">
              {t('settings.revealRawWarning')}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">{t('settings.captureTitle')}</h2>
        <div className="stack">
          <label className="row text-sm">
            <span style={{ flex: 1 }}>{t('settings.bodyLimit')}</span>
            <input
              type="number"
              className="input"
              style={{ maxWidth: 160 }}
              min={1024}
              max={65536}
              step={1024}
              value={settings.bodyPreviewLimit}
              onChange={(e) =>
                store.updateSettings({ bodyPreviewLimit: Number(e.target.value) })
              }
            />
          </label>
          <label className="row text-sm">
            <input
              type="checkbox"
              checked={settings.headful}
              onChange={(e) => store.updateSettings({ headful: e.target.checked })}
            />
            <span>
              {t('settings.headful')}
              <div className="muted text-xs">{t('settings.headfulDesc')}</div>
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">{t('settings.experimentalTitle')}</h2>
        <p className="muted text-sm">{t('settings.experimentalDesc')}</p>
        <label className="row text-sm" style={{ marginTop: 'var(--space-3)' }}>
          <input
            type="checkbox"
            checked={settings.experimentalReplay}
            onChange={(e) =>
              store.updateSettings({ experimentalReplay: e.target.checked })
            }
          />
          <span>
            {t('settings.replay')}
            <div className="muted text-xs">{t('settings.replayDesc')}</div>
          </span>
        </label>
      </div>

      <div className="card">
        <h2 className="card__title">{t('settings.dataTitle')}</h2>
        <p className="muted text-sm">{t('settings.dataDesc')}</p>
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          {!confirmDelete ? (
            <button className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
              {t('settings.deleteAll')}
            </button>
          ) : (
            <>
              <span className="text-sm reveal-warning">{t('settings.deleteAllConfirm')}</span>
              <button
                className="btn btn--danger"
                onClick={async () => {
                  await store.deleteAll();
                  setConfirmDelete(false);
                }}
              >
                {t('settings.deleteAllYes')}
              </button>
              <button className="btn btn--secondary" onClick={() => setConfirmDelete(false)}>
                {t('common.cancel')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
