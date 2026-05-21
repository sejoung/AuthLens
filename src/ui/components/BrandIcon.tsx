import { useTranslation } from 'react-i18next';

type Props = {
  size?: number;
  /** When true, image is presentational (aria-hidden). */
  decorative?: boolean;
  className?: string;
};

export function BrandIcon({ size = 28, decorative = false, className }: Props) {
  const { t } = useTranslation();
  return (
    <img
      src="/icon.svg"
      width={size}
      height={size}
      alt={decorative ? '' : t('common.brand')}
      aria-hidden={decorative || undefined}
      className={className}
      style={{ display: 'block' }}
      draggable={false}
    />
  );
}
