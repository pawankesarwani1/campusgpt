export default function Spinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-3',
  };

  return (
    <div
      className={`${sizes[size]} border-campusBlue/30 border-t-campusBlue rounded-full animate-spin ${className}`}
    />
  );
}
