import Spinner from './Spinner';

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  className = '',
  ...props
}) {
  const base = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-campusDark disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-campusBlue hover:bg-campusBlue/90 text-white focus:ring-campusBlue shadow-lg shadow-campusBlue/20 hover:shadow-campusBlue/30',
    secondary: 'bg-campusCard hover:bg-campusHover text-campusText border border-campusBorder/50 focus:ring-campusBorder',
    ghost: 'bg-transparent hover:bg-campusHover text-campusMuted hover:text-campusText focus:ring-campusBorder',
    danger: 'bg-campusError/10 hover:bg-campusError/20 text-campusError focus:ring-campusError',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${base} ${variants[variant] || variants.primary} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
