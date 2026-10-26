import { cn } from '@/lib/utils';
import { Link, type LinkProps } from 'react-router-dom';

const BASE_CLASS = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

const VARIANT_CLASS = {
  primary: 'bg-signal-500 text-white hover:bg-signal-600 shadow-[0_0_20px_-10px_rgb(63_230_198/0.4)]',
  outline: 'border border-signal-500/50 text-signal-400 hover:bg-signal-500/10 hover:text-signal-400',
  ghost: 'text-mist-300 hover:bg-ink-800/50 hover:text-mist-200',
  danger: 'bg-ember-500/10 border border-ember-500/40 text-ember-400 hover:bg-ember-500/20 hover:text-ember-300',
} as const;

const SIZE_CLASS = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
} as const;

export interface ButtonProps {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  onClick,
  children,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(BASE_CLASS, VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
    >
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

export function ButtonLink({ variant = 'primary', size = 'md', className = '', children, ...linkProps }: ButtonLinkProps) {
  return (
    <Link
      {...linkProps}
      className={cn(BASE_CLASS, VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
    >
      {children}
    </Link>
  );
}