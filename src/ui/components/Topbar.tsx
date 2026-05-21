import { useTranslation } from 'react-i18next';
import { BrandIcon } from './BrandIcon.js';

export function Topbar() {
  const { t } = useTranslation();
  return (
    <header className="topbar" role="banner">
      <div className="topbar__brand">
        <span className="topbar__brand-mark">
          <BrandIcon size={28} decorative />
        </span>
        <span>{t('common.brand')}</span>
      </div>
      <span className="topbar__notice">{t('common.topbarNotice')}</span>
    </header>
  );
}
