import { cn } from '@/lib/utils';

export interface BrandMarkProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function BrandMark({ className, size = 'md' }: BrandMarkProps) {
  const sizeClass = {
    sm: 'size-6',
    md: 'size-10',
    lg: 'size-12',
  }[size];

  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-md border border-ink-600 bg-ink-800 text-signal-300', sizeClass, className)}>
      <svg className="size-[72%]" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="11" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5" />
        <path d="M16 5a11 11 0 0 1 11 11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="16" cy="16" r="3.4" fill="currentColor" />
        <circle cx="16" cy="5" r="1.9" fill="var(--color-signal-400, #3fe6c6)" />
      </svg>
    </span>
  );
}
