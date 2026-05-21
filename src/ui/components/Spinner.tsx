type Props = {
  size?: number;
  ariaLabel?: string;
};

export function Spinner({ size = 14, ariaLabel }: Props) {
  return (
    <span
      className="spinner"
      role={ariaLabel ? 'status' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={{ width: size, height: size }}
    />
  );
}
