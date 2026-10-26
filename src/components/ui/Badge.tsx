import { cn } from '@/lib/utils';

export type BadgeVariant = 'inicial' | 'en_desarrollo' | 'solido' | 'destacado' | 'signal' | 'ion' | 'ember' | 'muted';
export type BadgeTone = 'done' | 'ready' | 'pending' | 'neutral' | 'accent' | 'danger';

export interface BadgeProps {
  variant?: BadgeVariant;
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<string, string> = {
  inicial: 'bg-signal-400/15 border border-signal-400/50 text-signal-300',
  en_desarrollo: 'border-ion-500/40 bg-ion-500/10 text-ion-300',
  solido: 'border-signal-400/50 bg-signal-500/10 text-signal-400',
  destacado: 'border-signal-400/50 bg-signal-500/10 text-signal-400',
  signal: 'border-signal-400/50 bg-signal-500/10 text-signal-400',
  ion: 'border-ion-500/40 bg-ion-500/10 text-ion-300',
  ember: 'border-ember-500/40 bg-ember-500/10 text-ember-400',
  muted: 'border-ink-600 bg-ink-800 text-mist-400',
  done: 'border-signal-400/50 bg-signal-500/10 text-signal-400',
  ready: 'border-ion-500/40 bg-ion-500/10 text-ion-300',
  pending: 'border-ember-500/40 bg-ember-500/10 text-ember-400',
  neutral: 'border-ink-600 bg-ink-800 text-mist-400',
  accent: 'border-signal-400/50 bg-signal-500/10 text-signal-400',
  danger: 'border-ember-500/40 bg-ember-500/10 text-ember-400',
};

export function Badge({ variant, tone, children, className }: BadgeProps) {
  const style = tone ?? variant ?? 'neutral';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium tracking-tight', VARIANT_CLASS[style], className)}>
      {children}
    </span>
  );
}
