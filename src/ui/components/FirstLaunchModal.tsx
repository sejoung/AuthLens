import { useTranslation } from 'react-i18next';
import { store, useAppState } from '../state/store.js';
import { BrandIcon } from './BrandIcon.js';

export function FirstLaunchModal() {
  const state = useAppState();
  const { t } = useTranslation();
  if (state.noticeAcknowledged) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <div className="modal">
        <div className="modal__hero" aria-hidden="true">
          <BrandIcon size={64} decorative />
        </div>
        <h2 className="modal__title" id="notice-title">
          {t('firstLaunch.title')}
        </h2>
        <p className="modal__body">{t('firstLaunch.noticeBody')}</p>
        <p className="modal__body">{t('firstLaunch.policyBody')}</p>
        <div className="modal__actions">
          <button className="btn btn--primary" onClick={store.acknowledgeNotice}>
            {t('firstLaunch.acknowledge')}
          </button>
        </div>
      </div>
    </div>
  );
}
