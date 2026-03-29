export default function AccountAvatar({
  size = 'md',
  alt = '',
  className = '',
}) {
  const sizeClass = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-16 h-16',
  }[size] || 'w-10 h-10';

  return (
    <span className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-[#E5E7EB] ring-1 ring-baby-text/10 ${sizeClass} ${className}`.trim()}>
      <img src="/default-avatar.svg" alt={alt} className="w-full h-full object-cover" />
    </span>
  );
}
