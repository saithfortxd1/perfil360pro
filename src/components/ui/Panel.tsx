import { cn } from '@/lib/utils';

export interface PanelProps {
  children: React.ReactNode;
  className?: string;
  ticks?: boolean;
}

export function Panel({ children, className, ticks = false }: PanelProps) {
  return (
    <div className={cn('panel', ticks && 'panel--ticks', className)}>
      {children}
    </div>
  );
}
