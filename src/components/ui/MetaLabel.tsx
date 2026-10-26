import { cn } from '@/lib/utils';

export interface MetaLabelProps {
  children: React.ReactNode;
  className?: string;
  index?: string;
}

export function MetaLabel({ children, className, index }: MetaLabelProps) {
  return (
    <p className={cn('meta-label flex items-center gap-2', className)}>
      {index ? <span className="font-mono text-ion-400">{index}</span> : null}
      {children}
    </p>
  );
}
